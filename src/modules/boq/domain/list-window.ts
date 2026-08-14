/**
 * Pagination / virtualization helpers for large BOQ node lists (UI agent).
 * Framework-free — no React dependency.
 */

export interface ListWindow<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly hasMore: boolean;
}

/** Slice a list for classic offset/limit pagination. */
export function sliceListWindow<T>(
  items: readonly T[],
  offset: number,
  limit: number,
): ListWindow<T> {
  const safeOffset = Math.max(0, Math.floor(offset) || 0);
  const safeLimit = Math.max(1, Math.floor(limit) || 1);
  const slice = items.slice(safeOffset, safeOffset + safeLimit);
  return {
    items: slice,
    total: items.length,
    offset: safeOffset,
    limit: safeLimit,
    hasMore: safeOffset + slice.length < items.length,
  };
}

/**
 * Window for virtualized lists: inclusive startIndex, exclusive endIndex
 * (same contract as most windowing libs).
 */
export function sliceVirtualWindow<T>(
  items: readonly T[],
  startIndex: number,
  endIndex: number,
): ListWindow<T> {
  const start = Math.max(0, Math.floor(startIndex) || 0);
  const end = Math.max(start, Math.floor(endIndex) || start);
  return sliceListWindow(items, start, Math.max(1, end - start));
}

export function pageCount(total: number, pageSize: number): number {
  const size = Math.max(1, Math.floor(pageSize) || 1);
  if (total <= 0) return 0;
  return Math.ceil(total / size);
}
