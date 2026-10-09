import { isNull, sql, type SQL } from 'drizzle-orm';
import { tasks } from '@drizzle/schema';

/**
 * Project-scoped task visibility (matches `listTasksPage` / task insights).
 * `null` / `undefined` → no extra filter (caller has full org project scope).
 */
export function taskProjectAccessCondition(
  accessibleProjectIds: readonly string[] | null | undefined,
): SQL | undefined {
  if (accessibleProjectIds === undefined || accessibleProjectIds === null) {
    return undefined;
  }
  if (accessibleProjectIds.length === 0) {
    return isNull(tasks.projectId);
  }
  return sql`(${tasks.projectId} IS NULL OR ${tasks.projectId} = ANY(${accessibleProjectIds}))`;
}
