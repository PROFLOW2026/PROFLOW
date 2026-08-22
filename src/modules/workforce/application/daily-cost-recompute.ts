/**
 * Daily employee cost: one daily employer-cost pool per worked date,
 * allocated across that day's entries by hours (exact conservation).
 */

import { toNumericString } from '@/shared/money';
import type { OrgContext } from '@/shared/auth/context';
import { isMonthClosed } from '@/modules/month-close';
import { businessDate } from '@/shared/dates';
import {
  listComponentsByRateVersion,
  listRateVersionsByEmployee,
} from '../data/rate-versions.repository';
import {
  listTimeEntries,
  patchTimeEntryCostSnapshot,
} from '../data/time-entries.repository';
import { allocateConservedAmountByHours } from '../domain/conserved-hour-allocation';
import { calculateDailyEmployerCostPool } from '../domain/employer-cost-pool';
import { resolveRateVersionForCosting } from '../domain/rate-lookup';
import type { TimeApprovalStatus } from '../domain/types';

export interface DailyCostRecomputeResult {
  readonly skipped: boolean;
  readonly reason: null | 'not_daily' | 'month_closed' | 'no_entries';
  readonly workDate: string;
  readonly employeeId: string;
  readonly updated: number;
  readonly dailyPool: string | null;
}

/**
 * Fill/rewrite cost snapshots for recorded entries on one day so
 * Σ costs = one daily employer pool (no double daily charge).
 *
 * @param approvalStatuses defaults to approved-only; pass submitted+approved
 *   when filling just before an approval transition (avoids approved-row lock).
 */
export async function recomputeDailyEmployeeCostForDate(
  context: OrgContext,
  input: {
    readonly employeeId: string;
    readonly workDate: string;
    readonly approvalStatuses?: readonly TimeApprovalStatus[];
  },
): Promise<DailyCostRecomputeResult> {
  const { employeeId, workDate } = input;
  const yearMonth = workDate.slice(0, 7);
  const base = {
    skipped: true as const,
    workDate,
    employeeId,
    updated: 0,
    dailyPool: null as string | null,
  };

  if (await isMonthClosed(context, yearMonth)) {
    return { ...base, reason: 'month_closed' };
  }

  const versions = await listRateVersionsByEmployee(
    context.db,
    context.organizationId,
    employeeId,
  );
  const rateVersion = resolveRateVersionForCosting(versions, businessDate(workDate));
  if (!rateVersion || rateVersion.rateUnit !== 'daily') {
    return { ...base, reason: 'not_daily' };
  }

  const approvalStatuses = input.approvalStatuses ?? (['approved'] as const);
  const allForDay = await listTimeEntries(context.db, context.organizationId, {
    employeeId,
    fromDate: workDate,
    toDate: workDate,
    status: 'recorded',
    approvalStatus: 'all',
    limit: 500,
  });
  const entries = allForDay.filter((e) =>
    (approvalStatuses as readonly string[]).includes(e.approvalStatus),
  );
  if (entries.length === 0) {
    return { ...base, reason: 'no_entries' };
  }

  const components = await listComponentsByRateVersion(
    context.db,
    context.organizationId,
    rateVersion.id,
  );
  const pool = calculateDailyEmployerCostPool({
    baseRate: rateVersion.baseRate,
    currency: rateVersion.currency,
    burdenPercent: rateVersion.burdenPercent,
    components,
  });

  const allocation = allocateConservedAmountByHours({
    knownAmount: pool,
    buckets: entries.map((entry) => ({ key: entry.id, hours: entry.hours })),
  });

  const amountByEntryId = new Map(
    allocation.buckets.map((b) => [b.key, toNumericString(b.amount)]),
  );

  let updated = 0;
  for (const entry of entries) {
    const costAmount = amountByEntryId.get(entry.id);
    if (!costAmount) continue;
    const patched = await patchTimeEntryCostSnapshot(
      context.db,
      context.organizationId,
      entry.id,
      {
        rateVersionId: rateVersion.id,
        costAmount,
        costCurrency: pool.currency,
      },
    );
    if (patched) updated += 1;
  }

  return {
    skipped: false,
    reason: null,
    workDate,
    employeeId,
    updated,
    dailyPool: toNumericString(pool),
  };
}

export async function recomputeDailyEmployeeCostsForDates(
  context: OrgContext,
  input: {
    readonly employeeId: string;
    readonly workDates: readonly string[];
    readonly approvalStatuses?: readonly TimeApprovalStatus[];
  },
): Promise<readonly DailyCostRecomputeResult[]> {
  const dates = [...new Set(input.workDates)].sort();
  const results: DailyCostRecomputeResult[] = [];
  for (const workDate of dates) {
    results.push(
      await recomputeDailyEmployeeCostForDate(context, {
        employeeId: input.employeeId,
        workDate,
        approvalStatuses: input.approvalStatuses,
      }),
    );
  }
  return results;
}

/** After authorized time mutations: monthly allocation and/or daily conserved fill. */
export async function recomputeEmployeeCostsAfterTimeChange(
  context: OrgContext,
  input: { readonly employeeId: string; readonly workDates: readonly string[] },
): Promise<void> {
  const { recomputeMonthlyEmployeeCostsForDates } = await import('./monthly-cost-recompute');
  await recomputeMonthlyEmployeeCostsForDates(context, input);
  await recomputeDailyEmployeeCostsForDates(context, input);
}
