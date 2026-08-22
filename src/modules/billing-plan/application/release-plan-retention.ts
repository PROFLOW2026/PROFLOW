import { getBillingRecord } from '@/modules/billing';
import { releaseBillingRecordRetention } from '@/modules/retention';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import {
  compareMoney,
  isPositiveMoney,
  isZeroMoney,
  money,
  subtractMoney,
  sumMoney,
  toNumericString,
  zeroMoney,
} from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';
import { findPlanById } from '../data/plans.repository';
import { listCyclesForPlan } from '../data/cycles.repository';
import { z } from 'zod';

const releasePlanRetentionSchema = z.object({
  planId: z.string().uuid(),
  amount: z.string().trim().min(1),
  releasedOn: z.string().trim().min(10).max(10).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type ReleasePlanRetentionInput = z.input<typeof releasePlanRetentionSchema>;

export async function listPlanRetentionHoldings(context: OrgContext, planId: string) {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const plan = await findPlanById(context.db, context.organizationId, planId);
  if (!plan) throw new NotFoundError('Billing plan');

  const cycles = await listCyclesForPlan(context.db, context.organizationId, planId);
  const issued = cycles
    .filter(
      (c) =>
        (c.status === 'submitted' ||
          c.status === 'partially_approved' ||
          c.status === 'approved') &&
        c.billingRecordId,
    )
    .sort((a, b) => a.cycleNumber - b.cycleNumber);

  const holdings: {
    cycleId: string;
    billingRecordId: string;
    heldRemaining: string;
    currency: string;
  }[] = [];

  const records = await Promise.all(
    issued.map((cycle) => getBillingRecord(context, cycle.billingRecordId!)),
  );
  for (let i = 0; i < issued.length; i += 1) {
    const cycle = issued[i]!;
    const record = records[i]!;
    const held = record.retentionHeldRemaining ?? money('0', record.totalAmount.currency);
    if (isPositiveMoney(held)) {
      holdings.push({
        cycleId: cycle.id,
        billingRecordId: record.id,
        heldRemaining: toNumericString(held),
        currency: held.currency,
      });
    }
  }

  const currency = plan.currency;
  const totalHeld =
    holdings.length === 0
      ? zeroMoney(currency)
      : sumMoney(
          holdings.map((h) => money(h.heldRemaining, h.currency)),
          currency,
        );

  return {
    planId,
    currency,
    heldRemaining: toNumericString(totalHeld),
    holdings,
  };
}

/**
 * Releases retention FIFO across issued cycle billing records that still hold retention.
 * Prevents over-release vs aggregate held remaining.
 */
export async function releasePlanRetention(
  context: OrgContext,
  raw: ReleasePlanRetentionInput,
) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = releasePlanRetentionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  const input = parsed.data;
  const snapshot = await listPlanRetentionHoldings(context, input.planId);
  const currency = snapshot.currency;
  let remainingToRelease = money(input.amount, currency);
  if (!isPositiveMoney(remainingToRelease)) {
    throw new ValidationError([{ path: 'amount', message: 'Release amount must be positive' }]);
  }
  const held = money(snapshot.heldRemaining, currency);
  if (compareMoney(remainingToRelease, held) > 0) {
    throw new DomainRuleError(
      'Cannot release more than retention held',
      'billingPlan.errors.retentionOverRelease',
    );
  }

  const releasedOn =
    input.releasedOn ?? todayInTimeZone(context.organization.timezone);
  const releases = [];

  for (const holding of snapshot.holdings) {
    if (isZeroMoney(remainingToRelease)) break;
    const heldOnRecord = money(holding.heldRemaining, holding.currency);
    const slice =
      compareMoney(remainingToRelease, heldOnRecord) <= 0
        ? remainingToRelease
        : heldOnRecord;
    const row = await releaseBillingRecordRetention(context, {
      sourceId: holding.billingRecordId,
      amount: toNumericString(slice),
      releasedOn,
      notes: input.notes ?? null,
    });
    releases.push(row);
    remainingToRelease = subtractMoney(remainingToRelease, slice);
  }

  const after = await listPlanRetentionHoldings(context, input.planId);
  return {
    releases,
    heldRemaining: after.heldRemaining,
    currency: after.currency,
  };
}
