import { appendAfter, generateSortKey, insertBetween, prependBefore } from '../domain/lexorank';

export function resolveMoveSortKeyFromNeighbors(options: {
  explicitSortKey?: string;
  afterSortKey?: string | null;
  beforeSortKey?: string | null;
}): string {
  if (options.explicitSortKey) return options.explicitSortKey;

  const afterSortKey = options.afterSortKey ?? null;
  const beforeSortKey = options.beforeSortKey ?? null;

  if (afterSortKey && beforeSortKey) {
    return insertBetween(afterSortKey, beforeSortKey);
  }
  if (afterSortKey) {
    return appendAfter(afterSortKey);
  }
  if (beforeSortKey) {
    return prependBefore(beforeSortKey);
  }
  return generateSortKey();
}
