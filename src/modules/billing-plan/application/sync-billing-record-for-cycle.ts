/**
 * Keep the cycle's linked AR billing_record aligned with requested/approved totals.
 *
 * - No record → create finalized invoice for amountDue
 * - Unpaid (paid=0) → void old + create new (same sourceKind/sourceId)
 * - Partial paid → newTotal >= paid; use credit adjustment on decrease (no void)
 * - Fully paid → throw
 */

import {
  createBillingAdjustment,
  createBillingRecordWithPermission,
  getBillingRecord,
  voidBillingRecord,
} from '@/modules/billing';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import {
  compareMoney,
  isZeroMoney,
  subtractMoney,
  toNumericString,
  type MoneyValue,
} from '@/shared/money';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertCannotReduceBelowPaid } from '../domain/lifecycle';
import { resolveCycleRetention } from '../domain/retention-math';
import { updateCycle } from '../data/cycles.repository';
import type { ProjectBillingCycleRecord } from '../domain/types';

export interface SyncBillingRecordForCycleInput {
  readonly cycle: ProjectBillingCycleRecord;
  readonly currency: string;
  readonly amountDue: MoneyValue;
  readonly retentionAmount?: MoneyValue | null;
  readonly retentionPercent?: string | null;
  readonly issueDate: string;
  readonly dueDate?: string | null;
  readonly reference?: string | null;
  readonly notes?: string | null;
  readonly taxAmount?: string | null;
  readonly finalize?: boolean;
}

function paymentState(record: {
  paidAmount: MoneyValue;
  totalAmount: MoneyValue;
  collectionStatus: string | null;
}): { paid: MoneyValue; fullyPaid: boolean } {
  const paid = record.paidAmount;
  const fullyPaid =
    record.collectionStatus === 'paid' ||
    (!isZeroMoney(record.totalAmount) && compareMoney(paid, record.totalAmount) >= 0);
  return { paid, fullyPaid };
}

export async function syncBillingRecordForCycle(
  context: OrgContext,
  input: SyncBillingRecordForCycleInput,
) {
  const { cycle, currency, amountDue } = input;
  const retention =
    input.retentionAmount ??
    resolveCycleRetention({
      cycleTotal: toNumericString(amountDue),
      currency,
      retentionPercent: input.retentionPercent,
    });

  if (!cycle.billingRecordId) {
    const billing = await createBillingRecordWithPermission(
      context,
      {
        projectId: cycle.projectId,
        contractId: cycle.contractId,
        amount: toNumericString(amountDue),
        ...(input.taxAmount
          ? { netAmount: toNumericString(amountDue), taxAmount: input.taxAmount }
          : {}),
        currency,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        reference: input.reference ?? `BP-${cycle.cycleNumber}`,
        notes: input.notes,
        retentionAmount: toNumericString(retention),
        finalize: input.finalize !== false,
        sourceKind: 'billing_plan',
        sourceId: cycle.id,
      },
      PERMISSIONS.BILLING_MANAGE,
    );
    const updated = await updateCycle(context.db, context.organizationId, cycle.id, {
      billingRecordId: billing.id,
    });
    return { billing, cycle: updated ?? cycle, mode: 'created' as const };
  }

  const existing = await getBillingRecord(context, cycle.billingRecordId);
  const { paid, fullyPaid } = paymentState(existing);

  if (fullyPaid) {
    throw new DomainRuleError(
      'Cannot sync billing for a fully paid cycle',
      'billingPlan.errors.cycleFullyPaidLocked',
      { cycleId: cycle.id, billingRecordId: existing.id },
    );
  }

  assertCannotReduceBelowPaid({
    paidAmount: paid,
    approvedTotal: amountDue,
    currency,
  });

  if (isZeroMoney(paid)) {
    await voidBillingRecord(context, existing.id);
    const baseRef = input.reference ?? existing.reference ?? `BP-${cycle.cycleNumber}`;
    const reference = `${baseRef}-r${cycle.revisionNumber ?? 1}-${Date.now().toString(36)}`;
    const billing = await createBillingRecordWithPermission(
      context,
      {
        projectId: cycle.projectId,
        contractId: cycle.contractId,
        amount: toNumericString(amountDue),
        ...(input.taxAmount
          ? { netAmount: toNumericString(amountDue), taxAmount: input.taxAmount }
          : {}),
        currency,
        issueDate: input.issueDate,
        dueDate: input.dueDate ?? existing.dueDate,
        reference,
        notes: input.notes ?? existing.notes,
        retentionAmount: toNumericString(retention),
        finalize: input.finalize !== false,
        sourceKind: 'billing_plan',
        sourceId: cycle.id,
      },
      PERMISSIONS.BILLING_MANAGE,
    );
    const updated = await updateCycle(context.db, context.organizationId, cycle.id, {
      billingRecordId: billing.id,
    });
    return { billing, cycle: updated ?? cycle, mode: 'replaced' as const };
  }

  const currentTotal = existing.totalAmount;
  const cmp = compareMoney(amountDue, currentTotal);
  if (cmp === 0) {
    return { billing: existing, cycle, mode: 'unchanged' as const };
  }

  if (cmp < 0) {
    const decrease = subtractMoney(currentTotal, amountDue);
    await createBillingAdjustment(context, {
      billingRecordId: existing.id,
      amount: toNumericString(decrease),
      issueDate: input.issueDate,
      notes:
        input.notes ??
        `Billing plan cycle ${cycle.cycleNumber} approval/edit adjustment`,
    });
    const refreshed = await getBillingRecord(context, existing.id);
    return { billing: refreshed, cycle, mode: 'adjusted' as const };
  }

  const increase = subtractMoney(amountDue, currentTotal);
  const topUp = await createBillingRecordWithPermission(
    context,
    {
      projectId: cycle.projectId,
      contractId: cycle.contractId,
      amount: toNumericString(increase),
      currency,
      issueDate: input.issueDate,
      dueDate: input.dueDate ?? existing.dueDate,
      reference: `${input.reference ?? existing.reference ?? `BP-${cycle.cycleNumber}`}-ADJ`,
      notes: `Top-up for billing plan cycle ${cycle.cycleNumber}`,
      retentionAmount: '0',
      finalize: input.finalize !== false,
      sourceKind: 'billing_plan',
      sourceId: cycle.id,
    },
    PERMISSIONS.BILLING_MANAGE,
  );
  return { billing: topUp, cycle, mode: 'topped_up' as const };
}

export async function loadCyclePaymentState(
  context: OrgContext,
  billingRecordId: string | null,
): Promise<{ paidAmount: string; fullyPaid: boolean }> {
  if (!billingRecordId) {
    return { paidAmount: '0', fullyPaid: false };
  }
  const record = await getBillingRecord(context, billingRecordId);
  const { paid, fullyPaid } = paymentState(record);
  return { paidAmount: toNumericString(paid), fullyPaid };
}
