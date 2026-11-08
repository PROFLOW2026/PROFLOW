import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { tasks } from '@drizzle/schema';

/**
 * `column = ANY(ARRAY[...]::uuid[])` with one bound parameter per id.
 * postgres-js expands `ANY(${jsArray})` into scalar parameters, which is not a uuid array.
 * An empty id list is `false` (match no rows). Callers must not drop that predicate.
 */
export function sqlUuidEqAny(column: SQLWrapper, ids: readonly string[]): SQL {
  if (ids.length === 0) return sql`false`;
  return sql`${column} = ANY(ARRAY[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]::uuid[])`;
}

/**
 * Project-scoped task visibility (matches list / insights / search).
 * `null` / `undefined` → no extra filter (`projects.access_all`).
 * `[]` → `project_id IS NULL` only. The predicate is never omitted.
 */
export function taskProjectAccessCondition(
  accessibleProjectIds: readonly string[] | null | undefined,
): SQL | undefined {
  if (accessibleProjectIds === undefined || accessibleProjectIds === null) {
    return undefined;
  }
  return sql`(${tasks.projectId} IS NULL OR ${sqlUuidEqAny(tasks.projectId, accessibleProjectIds)})`;
}
