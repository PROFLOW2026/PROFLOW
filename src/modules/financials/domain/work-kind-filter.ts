import type { WorkKindFilter } from './work-pricing';
import { matchesWorkKindFilter } from './work-pricing';

export interface WorkKindScopedRow {
  readonly workKind: string;
}

/**
 * Filters org rollup / report rows by All | Projects | Jobs.
 * Pure — used by application rollup and Scenario E tests.
 * Does not invent duplicates: each entity appears at most once.
 */
export function filterRowsByWorkKind<T extends WorkKindScopedRow>(
  rows: readonly T[],
  filter: WorkKindFilter,
): T[] {
  if (filter === 'all') return rows.slice();
  return rows.filter((row) => matchesWorkKindFilter(row.workKind, filter));
}

/**
 * Sum of actual costs across filtered rows — used to prove no double-count
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
