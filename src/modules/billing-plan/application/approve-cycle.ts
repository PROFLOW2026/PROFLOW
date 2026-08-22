import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { todayInTimeZone } from '@/shared/dates';
import {
  isZeroMoney,
  money,
  sumMoney,
  toNumericString,
  zeroMoney,
} from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  resolveApprovalSlice,
  retentionOnApproved,
} from '../domain/approval-math';
import { derivePercentFromAmount } from '../domain/line-math';
import {
  assertCanApproveCycle,
  assertCanTransitionCycleStatus,
  assertCannotReduceBelowPaid,
  resolveApprovalStatus,
} from '../domain/lifecycle';
import {
  resolveEffectiveRetentionPercent,
} from '../domain/retention-math';
import { BILLING_PLAN_AUDIT_ACTIONS } from '../domain/types';
import { findPlanById } from '../data/plans.repository';
import { findLineById } from '../data/lines.repository';
import {
  findCycleById,
  listCycleLines,
  updateCycle,
  upsertCycleLine,
} from '../data/cycles.repository';
import {
  buildCycleRevisionSnapshot,
  insertRevision,
} from '../data/revisions.repository';
import {
  loadCyclePaymentState,
  syncBillingRecordForCycle,
} from './sync-billing-record-for-cycle';
import { approveCycleSchema, type ApproveCycleInput } from '../validation/schemas';

function throwZod(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): never {
  throw new ValidationError(
    error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  );
}

/**
 * Approve (full or partial) a submitted cycle.
 * Sets approved_*, recomputes cumulative/remaining/retention from approved,
 * syncs AR to approved total, snapshots a revision.
 */
export async function approveBillingCycle(context: OrgContext, raw: ApproveCycleInput) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = approveCycleSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;

  const cycle = await findCycleById(context.db, context.organizationId, input.cycleId);
  if (!cycle) throw new NotFoundError('Billing cycle');
  assertCanApproveCycle(cycle.status);

  const plan = await findPlanById(context.db, context.organizationId, cycle.planId);
  if (!plan) throw new NotFoundError('Billing plan');

  const cycleLines = await listCycleLines(context.db, context.organizationId, cycle.id);
  if (cycleLines.length === 0) {
    throw new ValidationError([{ path: 'cycleId', message: 'Cycle has no lines' }]);
  }

  const currency = plan.currency;
  const payment = await loadCyclePaymentState(context, cycle.billingRecordId);
  const byPlanLine = new Map((input.lines ?? []).map((line) => [line.planLineId, line]));
  const approveAll = input.approveAllRequested === true || !(input.lines && input.lines.length > 0);

  const approvedAmounts = [];
  const approvalRows: { requestedAmount: string | null; approvedAmount: string | null }[] = [];

  for (const cl of cycleLines) {
    const planLine = await findLineById(context.db, context.organizationId, cl.planLineId);
    if (!planLine) throw new NotFoundError('Billing plan line');

    const base = money(cl.baseAmountSnapshot || planLine.agreedAmount, currency);
    const prior = money(cl.priorAmount, currency);
    const requested = money(cl.requestedAmount ?? cl.currentAmount ?? '0', currency);
    const entry = byPlanLine.get(cl.planLineId);

    const slice = resolveApprovalSlice({
      base,
      priorApproved: prior,
      requestedAmount: requested,
      approvedAmount: approveAll && !entry ? requested : entry?.approvedAmount,
      approvedPercent: entry?.approvedPercent,
    });

    const retentionPercent = resolveEffectiveRetentionPercent({
      lineOverride: planLine.retentionPercentOverride,
      cyclePercent: cycle.retentionPercent,
      planDefault: plan.defaultRetentionPercent,
    });
    const retention = retentionOnApproved({
      approvedAmount: slice.approvedAmount,
      retentionPercent,
    });

    if (!isZeroMoney(slice.approvedAmount)) {
      approvedAmounts.push(slice.approvedAmount);
    }
    approvalRows.push({
      requestedAmount: toNumericString(requested),
      approvedAmount: toNumericString(slice.approvedAmount),
    });

    await upsertCycleLine(context.db, {
      organizationId: context.organizationId,
      cycleId: cycle.id,
      planLineId: cl.planLineId,
      sortOrder: cl.sortOrder,
      currentPercent: cl.currentPercent,
      currentAmount: cl.currentAmount,
      requestedPercent: cl.requestedPercent ?? cl.currentPercent,
      requestedAmount: cl.requestedAmount ?? cl.currentAmount,
      approvedPercent: slice.approvedPercent,
      approvedAmount: toNumericString(slice.approvedAmount),
      priorPercent: cl.priorPercent,
      priorAmount: cl.priorAmount,
      cumulativePercent: derivePercentFromAmount(base, slice.cumulativeApproved),
      cumulativeAmount: toNumericString(slice.cumulativeApproved),
      remainingAmount: toNumericString(slice.remainingAmount),
      baseAmountSnapshot: toNumericString(base),
      retentionAmount: toNumericString(retention),
      lineNotes: cl.lineNotes,
    });
  }

  const approvedTotal =
    approvedAmounts.length === 0 ? zeroMoney(currency) : sumMoney(approvedAmounts, currency);

  assertCannotReduceBelowPaid({
    paidAmount: payment.paidAmount,
    approvedTotal,
    currency,
  });

  const nextStatus = resolveApprovalStatus({ currency, lines: approvalRows });
  assertCanTransitionCycleStatus(cycle.status, nextStatus);

  const retentionPercent = resolveEffectiveRetentionPercent({
    cyclePercent: cycle.retentionPercent,
    planDefault: plan.defaultRetentionPercent,
  });
  const cycleRetention = retentionOnApproved({
    approvedAmount: approvedTotal,
    retentionPercent,
  });

  const issueDate = cycle.accountDate ?? todayInTimeZone(context.organization.timezone);
  await syncBillingRecordForCycle(context, {
    cycle,
    currency,
    amountDue: approvedTotal,
    retentionAmount: cycleRetention,
    retentionPercent,
    issueDate,
    reference: `BP-${cycle.cycleNumber}`,
    notes: `${cycle.title} (#${cycle.cycleNumber}) — approved`,
    finalize: true,
  });

  const revisionNumber = (cycle.revisionNumber ?? 1) + 1;
  const linesAfter = await listCycleLines(context.db, context.organizationId, cycle.id);
  await insertRevision(context.db, {
    organizationId: context.organizationId,
    cycleId: cycle.id,
    revisionNumber,
    status: nextStatus,
    snapshotJson: buildCycleRevisionSnapshot({
      cycle: { ...cycle, status: nextStatus, revisionNumber },
      lines: linesAfter,
    }),
    changeSummary: nextStatus === 'approved' ? 'Fully approved' : 'Partially approved',
    createdByUserId: context.userId,
  });

  const approved = await updateCycle(context.db, context.organizationId, cycle.id, {
    status: nextStatus,
    revisionNumber,
  });

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.CYCLE_APPROVED,
    entityType: 'project_billing_cycle',
    entityId: cycle.id,
    after: {
      status: nextStatus,
      approvedTotal: toNumericString(approvedTotal),
      currency,
      revisionNumber,
    },
  });

  return {
    cycle: approved!,
    lines: linesAfter,
    status: nextStatus,
    approvedTotal: toNumericString(approvedTotal),
  };
}
