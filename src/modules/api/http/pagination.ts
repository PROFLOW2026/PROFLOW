/**
 * Cursor pagination helpers for versioned list endpoints.
 * Cursor is an opaque ISO timestamp of `createdAt` (descending lists).
 */

export const API_DEFAULT_PAGE_SIZE = 25;
export const API_MAX_PAGE_SIZE = 100;

export type ApiPaginationInput = {
  readonly limit: number;
  readonly cursor: string | null;
};

export type ApiPage<T> = {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
};

export function parseApiPagination(
  searchParams: URLSearchParams | { get(name: string): string | null },
  options?: { defaultLimit?: number; maxLimit?: number },
): ApiPaginationInput {
  const defaultLimit = options?.defaultLimit ?? API_DEFAULT_PAGE_SIZE;
  const maxLimit = options?.maxLimit ?? API_MAX_PAGE_SIZE;

  const rawLimit = searchParams.get('limit');
  let limit = defaultLimit;
  if (rawLimit !== null && rawLimit !== '') {
    const parsed = Number.parseInt(rawLimit, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, maxLimit);
    }
  }

  const cursorRaw = searchParams.get('cursor');
  const cursor = cursorRaw && cursorRaw.trim() !== '' ? cursorRaw.trim() : null;
  if (cursor && Number.isNaN(Date.parse(cursor))) {
    return { limit, cursor: null };
  }

  return { limit, cursor };
}

export function nextCursorFromItems<T extends { createdAt: Date }>(
  items: readonly T[],
  limit: number,
): string | null {
  if (items.length < limit || items.length === 0) return null;
  const last = items[items.length - 1];
  return last ? last.createdAt.toISOString() : null;
}
