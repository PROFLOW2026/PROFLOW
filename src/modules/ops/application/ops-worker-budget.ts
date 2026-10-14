/** Shared time budget helpers for the daily ops bundle (O04). */

export const OPS_WORKER_SAFE_BUDGET_MS = 280_000;

const MIN_REMAINING_TO_START_MS = 5_000;

/** Remaining wall-clock budget; returns 0 when exhausted (no 5s floor). */
export function remainingOpsBudgetMs(startedMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, OPS_WORKER_SAFE_BUDGET_MS - (nowMs - startedMs));
}

export function shouldSkipOpsJobForBudget(remainingMs: number): boolean {
  return remainingMs < MIN_REMAINING_TO_START_MS;
}

/** DG sub-worker budget from remaining bundle time (computed at job start). */
export function dgEventsBudgetMs(remainingMs: number): number {
  return Math.min(45_000, remainingMs);
}

/** Daily rotation key so org scan order shifts day-to-day (O04). */
export function rotatedOrgOrder<T extends { readonly id: string }>(
  orgs: readonly T[],
  dayOfYear: number,
): readonly T[] {
  if (orgs.length <= 1) return orgs;
  const sorted = [...orgs].sort((a, b) => a.id.localeCompare(b.id));
  const offset =
    sorted.reduce((acc, row, index) => acc + row.id.charCodeAt(0) * (index + 1), dayOfYear) %
    sorted.length;
  return [...sorted.slice(offset), ...sorted.slice(0, offset)];
}
