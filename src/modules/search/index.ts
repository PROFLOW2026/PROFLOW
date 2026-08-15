/** Public API of the search module. */
export { globalSearch } from './application/global-search';
export { globalSearchAction } from './application/search-actions';
export type { GlobalSearchHit, GlobalSearchKind, GlobalSearchResult } from './domain/types';
export { GLOBAL_SEARCH_KINDS } from './domain/types';
export { assetSearchHref, inventoryItemSearchHref, materialSearchHref } from './domain/hrefs';
export { globalSearchSchema } from './validation/schemas';
export type { GlobalSearchInput } from './validation/schemas';
