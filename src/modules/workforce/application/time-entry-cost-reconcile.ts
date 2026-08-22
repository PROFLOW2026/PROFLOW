import { ORG_LIST_EXPORT_CAP } from '@/shared/db/list-limits';
import { businessDate } from '@/shared/dates';
import type { MoneyValue } from '@/shared/money';
import type { OrgContext } from '@/shared/auth/context';
import { isMonthClosed } from '@/modules/month-close';
import {
  parseKnownMonthlyEmployerCost,
  resolveLaborCostFromCompensation,
  type LaborCostResolution,
} from '../domain/compensation-labor-cost';
import { resolveRateVersionForCosting } from '../domain/rate-lookup';
import type { WorkCalendarRates } from '../domain/work-calendar';
import type {
  LaborCostComponentRecord,
  RateVersionRecord,
  TimeEntryRecord,
} from '../domain/types';
import { listEmployeeMonthCostsForEmployee } from '../data/employee-month-costs.repository';
import {
  listComponentsByRateVersions,
  listRateVersionsByEmployee,
} from '../data/rate-versions.repository';
import {
  findTimeEntryById,
  listTimeEntries,
  patchTimeEntryCostSnapshot,
} from '../data/time-entries.repository';
import { resolveEmployeeWorkCalendarForCosting } from './work-calendar-context';

const PATCH_CONCURRENCY = 8;
const EMPLOYEE_CONCURRENCY = 4;

export interface TimeEntryCostReconcileResult {
  readonly updated: number;
  readonly skippedUnresolved: number;
  readonly skippedClosedMonths: number;
  readonly skippedApprovedLocked: number;
  readonly closedYearMonths: readonly string[];
  /**
   * Human-readable note when closed months blocked snapshot rewrite.
   * Closed periods freeze source rows; `time_correction` / void+replace also
   * call `assertMonthOpenForRewrite`, and month-close economic adjustments do
   * not rewrite `time_entries.cost_*`. No schema migration required — reopen
   * or leave closed months null until demoted.
   */
  readonly message: string | null;
}

function isApprovedTimeLockError(error: unknown): boolean {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      const code = (current as { code?: string }).code;
      if (typeof code === 'string') parts.push(code);
      current = current.cause;
      continue;
    }
    if (typeof current === 'object' && current !== null) {
      const record = current as { message?: string; code?: string; cause?: unknown };
      if (record.message) parts.push(record.message);
      if (record.code) parts.push(record.code);
      current = record.cause;
      continue;
    }
    parts.push(String(current));
    break;
  }
  const haystack = parts.join(' ');
  return (
    haystack.includes('approved time is locked') ||
    (haystack.includes('23000') && haystack.includes('time_entries'))
  );
}

/** Exported for unit tests — detection used when approved cost fill is still locked. */
export { isApprovedTimeLockError };

type ComponentSlice = readonly Pick<
  LaborCostComponentRecord,
  'basis' | 'amount' | 'percent' | 'currency'
>[];

function isMissingCostAmount(costAmount: string | null | undefined): boolean {
  return costAmount == null || costAmount.trim() === '';
}

/** Recorded rows eligible for owner-triggered cost/rate backfill. */
export function entryNeedsCostSnapshotReconcile(entry: {
  readonly costAmount: string | null;
  readonly rateVersionId: string | null;
}): boolean {
  return isMissingCostAmount(entry.costAmount) || entry.rateVersionId == null;
}

/**
 * Pure resolver used by batch reconcile (calendar + rates preloaded once).
 * Returns a cost amount only when calendar (for non-hourly) + rate resolve.
 */
export function resolvePreloadedTimeEntryCost(input: {
  readonly hours: string;
  readonly workDate: string;
  readonly calendar: WorkCalendarRates | null;
  readonly versions: readonly RateVersionRecord[];
  readonly componentsByRateId: ReadonlyMap<string, ComponentSlice>;
  readonly monthlyEmployerCostByYearMonth: ReadonlyMap<string, MoneyValue | null>;
}): LaborCostResolution {
  const rateVersion = resolveRateVersionForCosting(
    input.versions,
    businessDate(input.workDate),
  );
  const components = rateVersion
    ? (input.componentsByRateId.get(rateVersion.id) ?? [])
    : [];
  const yearMonth = input.workDate.slice(0, 7);
  const monthlyEmployerCost =
    input.monthlyEmployerCostByYearMonth.get(yearMonth) ?? null;

  return resolveLaborCostFromCompensation({
    hours: input.hours,
    calendar: input.calendar,
    rateVersion: rateVersion
      ? {
          id: rateVersion.id,
          baseRate: rateVersion.baseRate,
          currency: rateVersion.currency,
          rateUnit: rateVersion.rateUnit,
          burdenPercent: rateVersion.burdenPercent,
        }
      : null,
    components,
    monthlyEmployerCost,
  });
}

/**
 * Apply snapshot only when costing resolves to a non-null amount (calendar+rate
 * or monthly employer cost), and the row still needs cost and/or rate backfill.
 */
export function shouldApplyReconcileSnapshot(
  entry: {
    readonly costAmount: string | null;
    readonly rateVersionId: string | null;
  },
  resolution: LaborCostResolution,
): boolean {
  if (!resolution.costAmount) return false;
  if (isMissingCostAmount(entry.costAmount)) return true;
  return entry.rateVersionId == null && resolution.rateVersionId != null;
}

function buildClosedMonthsMessage(closedYearMonths: readonly string[]): string | null {
  if (closedYearMonths.length === 0) return null;
  return (
    `Skipped ${closedYearMonths.length} closed month(s) (${closedYearMonths.join(', ')}): ` +
    'assertMonthOpenForRewrite freezes time_entries cost snapshots; ' +
    'time_correction void+replace is also blocked on closed months; ' +
    'month-close economic adjustments do not rewrite entry cost_amount. ' +
    'Demote/reopen the month to backfill, or leave closed months unresolved. No migration 0067 required.'
  );
}

async function loadClosedYearMonthSet(
  context: OrgContext,
  yearMonths: readonly string[],
): Promise<ReadonlySet<string>> {
  const unique = [...new Set(yearMonths)];
  const closed = new Set<string>();
  for (let i = 0; i < unique.length; i += PATCH_CONCURRENCY) {
    const chunk = unique.slice(i, i + PATCH_CONCURRENCY);
    const flags = await Promise.all(
      chunk.map(async (yearMonth) => ({
        yearMonth,
        closed: await isMonthClosed(context, yearMonth),
      })),
    );
    for (const flag of flags) {
      if (flag.closed) closed.add(flag.yearMonth);
    }
  }
  return closed;
}

async function reconcileEmployeeMissingCosts(
  context: OrgContext,
  employeeId: string,
  rows: readonly TimeEntryRecord[],
): Promise<{
  readonly updated: number;
  readonly skippedUnresolved: number;
  readonly skippedClosedMonths: number;
  readonly skippedApprovedLocked: number;
  readonly closedYearMonths: readonly string[];
}> {
  const candidates = rows.filter(entryNeedsCostSnapshotReconcile);
  if (candidates.length === 0) {
    return {
      updated: 0,
      skippedUnresolved: 0,
      skippedClosedMonths: 0,
      skippedApprovedLocked: 0,
      closedYearMonths: [],
    };
  }

  const [costing, versions, monthCostRows] = await Promise.all([
    resolveEmployeeWorkCalendarForCosting(
      context.db,
      context.organizationId,
      employeeId,
    ),
    listRateVersionsByEmployee(context.db, context.organizationId, employeeId),
    listEmployeeMonthCostsForEmployee(
      context.db,
      context.organizationId,
      employeeId,
    ),
  ]);

  const calendar = costing.configured ? costing.rates : null;
  const components =
    versions.length > 0
      ? await listComponentsByRateVersions(
          context.db,
          context.organizationId,
          versions.map((version) => version.id),
        )
      : [];

  const componentsByRateId = new Map<string, LaborCostComponentRecord[]>();
  for (const component of components) {
    const list = componentsByRateId.get(component.rateVersionId);
    if (list) list.push(component);
    else componentsByRateId.set(component.rateVersionId, [component]);
  }

  const monthlyEmployerCostByYearMonth = new Map<string, MoneyValue | null>();
  for (const row of monthCostRows) {
    monthlyEmployerCostByYearMonth.set(
      row.yearMonth,
      parseKnownMonthlyEmployerCost({
        knownAmount: row.knownAmount,
        currency: row.currency,
      }),
    );
  }

  const yearMonths = candidates.map((row) => row.workDate.slice(0, 7));
  const closedMonths = await loadClosedYearMonthSet(context, yearMonths);
  const closedYearMonths = [...closedMonths].sort();

  let updated = 0;
  let skippedUnresolved = 0;
  let skippedClosedMonths = 0;
  let skippedApprovedLocked = 0;

  const openCandidates = candidates.filter((row) => {
    const yearMonth = row.workDate.slice(0, 7);
    if (closedMonths.has(yearMonth)) {
      skippedClosedMonths += 1;
      return false;
    }
    return true;
  });

  for (let i = 0; i < openCandidates.length; i += PATCH_CONCURRENCY) {
    const chunk = openCandidates.slice(i, i + PATCH_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (row) => {
        const resolution = resolvePreloadedTimeEntryCost({
          hours: row.hours,
          workDate: row.workDate,
          calendar,
          versions,
          componentsByRateId,
          monthlyEmployerCostByYearMonth,
        });
        if (!shouldApplyReconcileSnapshot(row, resolution)) {
          return 'unresolved' as const;
        }
        try {
          const patched = await patchTimeEntryCostSnapshot(
            context.db,
            context.organizationId,
            row.id,
            {
              rateVersionId: resolution.rateVersionId,
              costAmount: resolution.costAmount,
              costCurrency: resolution.costCurrency,
            },
          );
          return patched ? ('updated' as const) : ('unchanged' as const);
        } catch (error) {
          // Pre-0067 DBs reject approved cost fill; do not abort the Owner save.
          if (isApprovedTimeLockError(error)) return 'locked' as const;
          throw error;
        }
      }),
    );
    for (const result of results) {
      if (result === 'updated') updated += 1;
      else if (result === 'unresolved') skippedUnresolved += 1;
      else if (result === 'locked') skippedApprovedLocked += 1;
    }
  }

  return {
    updated,
    skippedUnresolved,
    skippedClosedMonths,
    skippedApprovedLocked,
    closedYearMonths,
  };
}

/**
 * Single-entry backfill (create / approve paths). Does not mutate when cost
 * already present. Skips silently when calendar+rate do not yet resolve.
 */
export async function refreshTimeEntryCostSnapshotIfMissing(
  context: OrgContext,
  timeEntryId: string,
): Promise<TimeEntryRecord | null> {
  const entry = await findTimeEntryById(context.db, context.organizationId, timeEntryId);
  if (!entry || entry.status !== 'recorded' || entry.archivedAt) return null;
  if (!entryNeedsCostSnapshotReconcile(entry)) return entry;

  const result = await reconcileEmployeeMissingCosts(context, entry.employeeId, [entry]);
  if (result.updated === 0) return entry;
  return (
    (await findTimeEntryById(context.db, context.organizationId, timeEntryId)) ?? entry
  );
}

/**
 * Backfill null labor-cost snapshots (and stale null rate_version_id) after
 * explicit Owner saves — never from employee page GET.
 */
export async function reconcileMissingTimeEntryCosts(
  context: OrgContext,
  filters: { readonly employeeId?: string; readonly projectId?: string } = {},
): Promise<TimeEntryCostReconcileResult> {
  const rows = await listTimeEntries(context.db, context.organizationId, {
    employeeId: filters.employeeId,
    projectId: filters.projectId,
    status: 'recorded',
    approvalStatus: 'all',
    limit: ORG_LIST_EXPORT_CAP,
  });

  const candidates = rows.filter(entryNeedsCostSnapshotReconcile);
  if (candidates.length === 0) {
    return {
      updated: 0,
      skippedUnresolved: 0,
      skippedClosedMonths: 0,
      skippedApprovedLocked: 0,
      closedYearMonths: [],
      message: null,
    };
  }

  const byEmployee = new Map<string, TimeEntryRecord[]>();
  for (const row of candidates) {
    const list = byEmployee.get(row.employeeId);
    if (list) list.push(row);
    else byEmployee.set(row.employeeId, [row]);
  }

  const employeeIds = [...byEmployee.keys()];
  let updated = 0;
  let skippedUnresolved = 0;
  let skippedClosedMonths = 0;
  let skippedApprovedLocked = 0;
  const closedYearMonths = new Set<string>();

  for (let i = 0; i < employeeIds.length; i += EMPLOYEE_CONCURRENCY) {
    const chunk = employeeIds.slice(i, i + EMPLOYEE_CONCURRENCY);
    const results = await Promise.all(
      chunk.map((employeeId) =>
        reconcileEmployeeMissingCosts(context, employeeId, byEmployee.get(employeeId) ?? []),
      ),
    );
    for (const result of results) {
      updated += result.updated;
      skippedUnresolved += result.skippedUnresolved;
      skippedClosedMonths += result.skippedClosedMonths;
      skippedApprovedLocked += result.skippedApprovedLocked;
      for (const yearMonth of result.closedYearMonths) {
        closedYearMonths.add(yearMonth);
      }
    }
  }

  const closedSorted = [...closedYearMonths].sort();
  const messages = [
    buildClosedMonthsMessage(closedSorted),
    skippedApprovedLocked > 0
      ? `Skipped ${skippedApprovedLocked} approved entr(y/ies): apply migration 0067_time_entry_cost_snapshot_fill then re-save to fill hourly/daily null cost snapshots (not monthly).`
      : null,
  ].filter(Boolean);

  // Monthly employees: allocate open months from approved work (never snapshot ÷ days).
  const { recomputeOpenMonthsAfterCompensationChange } = await import('./monthly-cost-recompute');
  const monthlyTargets =
    filters.employeeId != null ? [filters.employeeId] : employeeIds;
  for (const employeeId of monthlyTargets) {
    await recomputeOpenMonthsAfterCompensationChange(context, employeeId);
  }

  return {
    updated,
    skippedUnresolved,
    skippedClosedMonths,
    skippedApprovedLocked,
    closedYearMonths: closedSorted,
    message: messages.length > 0 ? messages.join(' ') : null,
  };
}
