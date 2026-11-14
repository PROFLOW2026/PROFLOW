/**
 * Flatten settled search-kind jobs. A rejected optional kind (missing table,
 * transient query error) must not discard hits from other kinds.
 */
export function flattenSettledSearchKindJobs<T>(
  settled: readonly PromiseSettledResult<readonly T[]>[],
): T[] {
  return settled.flatMap((result) => (result.status === 'fulfilled' ? [...result.value] : []));
}
