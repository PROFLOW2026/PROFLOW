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
  cumulativeApproved,
  remainingAfterApproved,
  retentionOnApproved,
} from '../domain/approval-math';
import {
  assertCannotReduceBelowPaid,
  assertCycleEditable,
} from '../domain/lifecycle';
import { allocateFinalSlice, assertWithinLineCap, derivePercentFromAmount } from '../domain/line-math';
import {
  resolveCycleLineRetention,
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
import {
  updateCycleLinesSchema,
  type UpdateCycleLinesInput,
} from '../validation/schemas';

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

const POST_SUBMIT: ReadonlySet<string> = new Set([
  'submitted',
  'partially_approved',
  'approved',
]);

/**
 * Enter % or amount on cycle lines.
 * Editable until linked AR is fully paid (including after submit/approval).
 * Post-submit edits clear approval, bump revision, and sync AR to new requested.
 */
export async function updateCycleLines(context: OrgContext, raw: UpdateCycleLinesInput) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = updateCycleLinesSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;

  const cycle = await findCycleById(context.db, context.organizationId, input.cycleId);
  if (!cycle) throw new NotFoundError('Billing cycle');

  const plan = await findPlanById(context.db, context.organizationId, cycle.planId);
  if (!plan) throw new NotFoundError('Billing plan');
  const currency = plan.currency;

  const payment = await loadCyclePaymentState(context, cycle.billingRecordId);
  assertCycleEditable({
    status: cycle.status,
    fullyPaid: payment.fullyPaid,
    paidAmount: payment.paidAmount,
    approvedTotal: payment.paidAmount,
    currency,
  });

  const existingLines = await listCycleLines(context.db, context.organizationId, cycle.id);
  const byPlanLine = new Map(existingLines.map((l) => [l.planLineId, l]));
  const workingCycle = cycle;
  const wasSubmitted = POST_SUBMIT.has(workingCycle.status);

  const updated = [];
  for (const entry of input.lines) {
    const planLine = await findLineById(context.db, context.organizationId, entry.planLineId);
    if (!planLine || planLine.planId !== plan.id) {
      throw new NotFoundError('Billing plan line');
    }

    const existing = byPlanLine.get(entry.planLineId);
    const base = money(planLine.agreedAmount, currency);
    const prior = money(existing?.priorAmount ?? '0', currency);

    const slice = allocateFinalSlice({
      base,
      priorAmount: prior,
      requestedAmount: entry.closeRemainder ? undefined : entry.currentAmount,
      requestedPercent: entry.closeRemainder ? undefined : entry.currentPercent,
      closePercentTolerance: entry.closeRemainder ? '100' : undefined,
    });

    const finalSlice = entry.closeRemainder
      ? allocateFinalSlice({
          base,
          priorAmount: prior,
          requestedAmount: toNumericString(
            money(existing?.remainingAmount ?? toNumericString(base), currency),
          ),
          closePercentTolerance: '100',
        })
      : slice;

    assertWithinLineCap(base, prior, finalSlice.currentAmount);

    const retentionPercent = resolveEffectiveRetentionPercent({
      lineOverride: planLine.retentionPercentOverride,
      cyclePercent: cycle.retentionPercent,
      planDefault: plan.defaultRetentionPercent,
    });

    // Cumulative is always prior + coalesce(approved, 0) — never requested.
    const clearApproval = wasSubmitted;
    const approvedAmount = clearApproval ? null : existing?.approvedAmount ?? null;
    const approvedPercent = clearApproval ? null : existing?.approvedPercent ?? null;

    let cumulativeAmount = prior;
    let cumulativePercent = existing?.priorPercent ?? '0';
    let remaining = remainingAfterApproved(base, prior);
    let retention = zeroMoney(currency);

    if (approvedAmount != null) {
      const approved = money(approvedAmount, currency);
      cumulativeAmount = cumulativeApproved(prior, approved);
      cumulativePercent = derivePercentFromAmount(base, cumulativeAmount);
      remaining = remainingAfterApproved(base, cumulativeAmount);
      retention = retentionOnApproved({
        approvedAmount: approved,
        retentionPercent,
      });
    } else {
      // Draft / submitted awaiting approval: cumulative stays at prior.
      remaining = remainingAfterApproved(base, prior);
      retention = resolveCycleLineRetention({
        lineAmount: toNumericString(finalSlice.currentAmount),
        currency,
        retentionPercent,
      });
    }

    const row = await upsertCycleLine(context.db, {
      organizationId: context.organizationId,
      cycleId: cycle.id,
      planLineId: entry.planLineId,
      sortOrder: existing?.sortOrder ?? planLine.sortOrder,
      currentPercent: finalSlice.currentPercent,
      currentAmount: toNumericString(finalSlice.currentAmount),
      requestedPercent: wasSubmitted ? finalSlice.currentPercent : existing?.requestedPercent ?? null,
      requestedAmount: wasSubmitted
        ? toNumericString(finalSlice.currentAmount)
        : existing?.requestedAmount ?? null,
      approvedPercent,
      approvedAmount,
      priorPercent: existing?.priorPercent ?? '0',
      priorAmount: toNumericString(prior),
      cumulativePercent,
      cumulativeAmount: toNumericString(cumulativeAmount),
      remainingAmount: toNumericString(remaining),
      baseAmountSnapshot: toNumericString(base),
      retentionAmount: toNumericString(retention),
      lineNotes: entry.lineNotes ?? existing?.lineNotes ?? null,
    });
    updated.push(row);
  }

  let nextCycle = workingCycle;
  if (wasSubmitted) {
    const requestedTotal = updated.reduce(
      (acc, line) => {
        const amt = money(line.currentAmount ?? '0', currency);
        return isZeroMoney(amt) ? acc : sumMoney([acc, amt], currency);
      },
      zeroMoney(currency),
    );

    assertCannotReduceBelowPaid({
      paidAmount: payment.paidAmount,
      approvedTotal: toNumericString(requestedTotal),
      currency,
    });

    const revisionNumber = (workingCycle.revisionNumber ?? 1) + 1;
    const linesAfter = await listCycleLines(
      context.db,
      context.organizationId,
      workingCycle.id,
    );
    await insertRevision(context.db, {
      organizationId: context.organizationId,
      cycleId: workingCycle.id,
      revisionNumber,
      status: 'submitted',
      snapshotJson: buildCycleRevisionSnapshot({
        cycle: { ...workingCycle, status: 'submitted', revisionNumber },
        lines: linesAfter,
      }),
      changeSummary: 'Revised after submit (pre-payment)',
      createdByUserId: context.userId,
    });
    nextCycle =
      (await updateCycle(context.db, context.organizationId, workingCycle.id, {
        status: 'submitted',
        revisionNumber,
      })) ?? workingCycle;

    await syncBillingRecordForCycle(context, {
      cycle: nextCycle,
      currency,
      amountDue: requestedTotal,
      retentionPercent: resolveEffectiveRetentionPercent({
        cyclePercent: workingCycle.retentionPercent,
        planDefault: plan.defaultRetentionPercent,
      }),
      issueDate: workingCycle.accountDate ?? todayInTimeZone(context.organization.timezone),
      notes: `Cycle ${workingCycle.cycleNumber} revised (v${revisionNumber})`,
    });
  }

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.CYCLE_UPDATED,
    entityType: 'project_billing_cycle',
    entityId: workingCycle.id,
    after: { linesUpdated: updated.length, revised: wasSubmitted },
  });

  return {
    cycle: nextCycle,
    lines: await listCycleLines(context.db, context.organizationId, workingCycle.id),
  };
}
