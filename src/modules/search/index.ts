/** Public API of the search module. */
export { globalSearch } from './application/global-search';
export { globalSearchAction } from './application/search-actions';
export type {
  GlobalSearchGroup,
  GlobalSearchHit,
  GlobalSearchKind,
  GlobalSearchResult,
  SearchCommandHit,
} from './domain/types';
export { GLOBAL_SEARCH_KINDS } from './domain/types';
export {
  assetSearchHref,
  inventoryItemSearchHref,
  materialSearchHref,
  warrantySearchHref,
  communicationSearchHref,
  calendarEventSearchHref,
  closeoutSearchHref,
  workEntityHref,
} from './domain/hrefs';
export { globalSearchSchema } from './validation/schemas';
export type { GlobalSearchInput } from './validation/schemas';
export { matchSearchCommands } from './domain/commands';
export { groupSearchHits } from './domain/group';
