import { createBillingRecordWithPermission } from '@/modules/billing';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { todayInTimeZone } from '@/shared/dates';
import {
  isZeroMoney,
  money,
  subtractMoney,
  sumMoney,
  toNumericString,
  zeroMoney,
} from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertBoqNodeNotAlreadyBilled,
  assertCanSubmitCycle,
  assertCanTransitionCycleStatus,
} from '../domain/lifecycle';
import { assertWithinLineCap } from '../domain/line-math';
import {
  resolveCycleRetention,
  resolveEffectiveRetentionPercent,
} from '../domain/retention-math';
import { BILLING_PLAN_AUDIT_ACTIONS } from '../domain/types';
import { findPlanById } from '../data/plans.repository';
import { findLineById, freezeAgreedAmountSnapshots } from '../data/lines.repository';
import {
  findCycleById,
  listCycleLines,
  updateCycle,
  upsertCycleLine,
} from '../data/cycles.repository';
import { boqNodeHasProgressBillingClaimOrLink } from '../data/boq-guard.repository';
import {
  buildCycleRevisionSnapshot,
  insertRevision,
} from '../data/revisions.repository';
import { syncBillingRecordForCycle } from './sync-billing-record-for-cycle';
import { issueCycleSchema, type IssueCycleInput } from '../validation/schemas';

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
 * Submit a progress account: copy current_* → requested_*, status=submitted,
 * create/sync AR at requested totals. Approval may later revise AR downward.
 */
export async function submitBillingCycle(context: OrgContext, raw: IssueCycleInput) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = issueCycleSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;

  const cycle = await findCycleById(context.db, context.organizationId, input.cycleId);
  if (!cycle) throw new NotFoundError('Billing cycle');
  assertCanSubmitCycle(cycle.status);

  const plan = await findPlanById(context.db, context.organizationId, cycle.planId);
  if (!plan) throw new NotFoundError('Billing plan');

  const cycleLines = await listCycleLines(context.db, context.organizationId, cycle.id);
  if (cycleLines.length === 0) {
    throw new ValidationError([{ path: 'cycleId', message: 'Cycle has no lines to bill' }]);
  }

  const currency = plan.currency;
  const currentAmounts = [];
  const lineNotes: string[] = [];
  const snapshotMap = new Map<string, string>();

  for (const cl of cycleLines) {
    const planLine = await findLineById(context.db, context.organizationId, cl.planLineId);
    if (!planLine) throw new NotFoundError('Billing plan line');

    if (planLine.boqNodeId) {
      try {
        const alreadyBilled = await boqNodeHasProgressBillingClaimOrLink(
          context.db,
          context.organizationId,
          planLine.boqNodeId,
        );
        assertBoqNodeNotAlreadyBilled(alreadyBilled);
      } catch (error) {
        if (error instanceof DomainRuleError) throw error;
      }
    }

    const base = money(planLine.agreedAmount, currency);
    const prior = money(cl.priorAmount, currency);
    const current = money(cl.currentAmount ?? '0', currency);
    assertWithinLineCap(base, prior, current);

    if (!isZeroMoney(current)) {
      currentAmounts.push(current);
      lineNotes.push(
        `${planLine.label}: ${toNumericString(current)} ${currency}` +
          (cl.currentPercent ? ` (${cl.currentPercent}%)` : ''),
      );
    }
    snapshotMap.set(planLine.id, toNumericString(base));

    const remaining = subtractMoney(base, prior);
    await upsertCycleLine(context.db, {
      organizationId: context.organizationId,
      cycleId: cycle.id,
      planLineId: cl.planLineId,
      sortOrder: cl.sortOrder,
      currentPercent: cl.currentPercent,
      currentAmount: cl.currentAmount,
      requestedPercent: cl.currentPercent,
      requestedAmount: cl.currentAmount,
      approvedPercent: null,
      approvedAmount: null,
      priorPercent: cl.priorPercent,
      priorAmount: cl.priorAmount,
      cumulativePercent: cl.priorPercent,
      cumulativeAmount: cl.priorAmount,
      remainingAmount: toNumericString(remaining),
      baseAmountSnapshot: toNumericString(base),
      retentionAmount: '0',
      lineNotes: cl.lineNotes,
    });
  }

  const cycleTotal =
    currentAmounts.length === 0 ? zeroMoney(currency) : sumMoney(currentAmounts, currency);
  if (isZeroMoney(cycleTotal)) {
    throw new ValidationError([
      { path: 'cycleId', message: 'Cycle current amount is zero — nothing to submit' },
    ]);
  }

  const retentionPercent =
    input.retentionPercent ??
    resolveEffectiveRetentionPercent({
      cyclePercent: cycle.retentionPercent,
      planDefault: plan.defaultRetentionPercent,
    });
  const retention = resolveCycleRetention({
    cycleTotal: toNumericString(cycleTotal),
    currency,
    retentionAmount: input.retentionAmount,
    retentionPercent,
  });

  const issueDate =
    input.issueDate ?? cycle.accountDate ?? todayInTimeZone(context.organization.timezone);

  const notes = [
    `${cycle.title} (#${cycle.cycleNumber})`,
    input.notes?.trim() || cycle.notes || null,
    lineNotes.slice(0, 40).join('; '),
  ]
    .filter(Boolean)
    .join('\n');

  assertCanTransitionCycleStatus(cycle.status, 'submitted');

  const linesAfter = await listCycleLines(context.db, context.organizationId, cycle.id);
  await insertRevision(context.db, {
    organizationId: context.organizationId,
    cycleId: cycle.id,
    revisionNumber: cycle.revisionNumber ?? 1,
    status: 'submitted',
    snapshotJson: buildCycleRevisionSnapshot({
      cycle: { ...cycle, status: 'submitted' },
      lines: linesAfter,
    }),
    changeSummary: 'Submitted to customer',
    createdByUserId: context.userId,
  });

  let billing;
  if (cycle.billingRecordId) {
    const synced = await syncBillingRecordForCycle(context, {
      cycle,
      currency,
      amountDue: cycleTotal,
      retentionAmount: retention,
      retentionPercent,
      issueDate,
      dueDate: input.dueDate,
      reference: input.reference?.trim() || `BP-${cycle.cycleNumber}`,
      notes,
      taxAmount: input.taxAmount,
      finalize: input.finalize !== false,
    });
    billing = synced.billing;
  } else {
    billing = await createBillingRecordWithPermission(
      context,
      {
        projectId: cycle.projectId,
        contractId: cycle.contractId,
        amount: toNumericString(cycleTotal),
        ...(input.taxAmount
          ? { netAmount: toNumericString(cycleTotal), taxAmount: input.taxAmount }
          : {}),
        currency,
        issueDate,
        dueDate: input.dueDate,
        reference: input.reference?.trim() || `BP-${cycle.cycleNumber}`,
        notes,
        retentionAmount: toNumericString(retention),
        finalize: input.finalize !== false,
        sourceKind: 'billing_plan',
        sourceId: cycle.id,
      },
      PERMISSIONS.BILLING_MANAGE,
    );
  }

  const submitted = await updateCycle(context.db, context.organizationId, cycle.id, {
    status: 'submitted',
    billingRecordId: billing.id,
    submittedAt: new Date(),
    submittedByUserId: context.userId,
  });

  await freezeAgreedAmountSnapshots(
    context.db,
    context.organizationId,
    [...snapshotMap.keys()],
    snapshotMap,
  );

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.CYCLE_SUBMITTED,
    entityType: 'project_billing_cycle',
    entityId: cycle.id,
    after: {
      billingRecordId: billing.id,
      totalAmount: toNumericString(cycleTotal),
      currency,
      retentionAmount: toNumericString(retention),
      sourceKind: 'billing_plan',
      status: 'submitted',
    },
  });

  return { cycle: submitted!, billing };
}

/** @deprecated Prefer submitBillingCycle — submit replaces issue. */
export const issueBillingCycle = submitBillingCycle;
