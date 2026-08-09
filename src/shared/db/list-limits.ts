/**
 * Shared list pagination defaults for org-scoped hot paths.
 * Analytical / export callers must pass an explicit higher limit.
 */

/** Default page size for UI list endpoints. */
export const ORG_LIST_PAGE_SIZE = 50;

/** Safety cap when a list has no dedicated pagination UI yet. */
export const ORG_LIST_HARD_CAP = 200;

/** Cap for CSV / cash-flow style consumers. */
export const ORG_LIST_EXPORT_CAP = 5_000;

export function resolveListLimit(
  requested: number | undefined,
  options: { readonly defaultLimit?: number; readonly hardCap?: number } = {},
): number {
  const defaultLimit = options.defaultLimit ?? ORG_LIST_PAGE_SIZE;
  const hardCap = options.hardCap ?? ORG_LIST_HARD_CAP;
  const raw = requested ?? defaultLimit;
  if (!Number.isFinite(raw) || raw < 0) return defaultLimit;
  return Math.min(Math.trunc(raw), hardCap);
}

export function resolveListOffset(requested: number | undefined): number {
  if (requested == null || !Number.isFinite(requested) || requested < 0) return 0;
  return Math.trunc(requested);
}
