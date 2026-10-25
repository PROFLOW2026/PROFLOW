import type { WorkKindFilter } from './work-pricing';
import { matchesWorkKindFilter } from './work-pricing';

export interface WorkKindScopedRow {
  readonly workKind: string;
}

/**
 * Filters org rollup / report rows by All | Projects | Jobs.
 * Pure - used by application rollup and Scenario E tests.
 * Does not invent duplicates: each entity appears at most once.
 */
export function filterRowsByWorkKind<T extends WorkKindScopedRow>(
  rows: readonly T[],
  filter: WorkKindFilter,
): T[] {
  if (filter === 'all') return rows.slice();
  return rows.filter((row) => matchesWorkKindFilter(row.workKind, filter));
}

export function dashboardWorkKindHref(
  pathname: '/' | '/reports',
  workKind: WorkKindFilter,
  month?: string | null,
): string {
  const params = new URLSearchParams();
  if (month && /^\d{4}-\d{2}$/.test(month)) params.set('month', month);
  if (workKind !== 'all') params.set('workKind', workKind);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Hours stay visible on a project/job facet even when the pool is empty. */
export function laborPoolForWorkKindFilter(input: {
  readonly filter: WorkKindFilter;
  readonly allocatedHours: number;
  readonly pendingHours: number;
}): {
  readonly allocatedHours: number;
  readonly unallocatedHours: number;
  readonly totalHours: number;
} | null {
  const totalHours = input.allocatedHours + input.pendingHours;
  if (totalHours <= 0 && input.filter === 'all') return null;
  return {
    allocatedHours: input.allocatedHours,
    unallocatedHours: input.pendingHours,
    totalHours,
  };
}

/** Paid-cash facts follow the same project ids the selected facet already rolled up. */
export function scopeProjectPaidFactsToRollup<T extends { readonly projectId: string | null }>(
  facts: readonly T[],
  filter: WorkKindFilter,
  rollupProjectIds: readonly string[],
): readonly T[] {
  if (filter === 'all') return facts;
  const allowed = new Set(rollupProjectIds);
  return facts.filter((fact) => fact.projectId != null && allowed.has(fact.projectId));
}

/**
 * Sum of actual costs across filtered rows - used to prove no double-count
 * when switching All ↔ Projects ↔ Jobs (Projects + Jobs = All).
 */
export function partitionWorkKindCounts(rows: readonly WorkKindScopedRow[]): {
  readonly all: number;
  readonly project: number;
  readonly job: number;
  readonly workOrder: number;
} {
  let project = 0;
  let job = 0;
  let workOrder = 0;
  for (const row of rows) {
    if (row.workKind === 'job') job += 1;
    else if (row.workKind === 'work_order') workOrder += 1;
    else project += 1;
  }
  return { all: rows.length, project, job, workOrder };
}
