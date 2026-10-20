/** Optional list page sizes (query param `pageSize`) for Main App lists that opt in. */
export const MAIN_APP_LIST_PAGE_SIZES = [10, 20, 50] as const;
export type MainAppListPageSize = (typeof MAIN_APP_LIST_PAGE_SIZES)[number];

export const MAIN_APP_DEFAULT_LIST_PAGE_SIZE: MainAppListPageSize = 20;

export function parseMainAppListPageSize(
  raw: string | undefined,
  defaultSize: MainAppListPageSize = MAIN_APP_DEFAULT_LIST_PAGE_SIZE,
): MainAppListPageSize {
  const parsed = parseInt(raw ?? '', 10);
  if (parsed === 10 || parsed === 20 || parsed === 50) return parsed;
  return defaultSize;
}
