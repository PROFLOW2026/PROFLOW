/**
 * Bounded task-list windows. Callers must pass an explicit limit when a
 * screen should show more than the default page, and must surface hasMore.
 */

export const TASK_LIST_DEFAULT_LIMIT = 50;
export const TASK_LIST_MAX_LIMIT = 500;
export const MY_WORK_VIEW_LIMIT = 100;

export function clampTaskListLimit(requested: number | undefined): number {
  if (requested == null || !Number.isFinite(requested)) return TASK_LIST_DEFAULT_LIMIT;
  const floored = Math.floor(requested);
  if (floored < 1) return TASK_LIST_DEFAULT_LIMIT;
  return Math.min(floored, TASK_LIST_MAX_LIMIT);
}

/** `rows` must be the query result of `limit + 1` so an exact page is not treated as truncated. */
export function splitTaskListPage<T>(
  rows: readonly T[],
  limit: number,
): { items: T[]; hasMore: boolean } {
  if (rows.length > limit) {
    return { items: rows.slice(0, limit), hasMore: true };
  }
  return { items: [...rows], hasMore: false };
}
