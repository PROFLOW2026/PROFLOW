/**
 * Permission-safe global search domain types.
 * Results never include Actual / profit / employee cost / overhead.
 */

export const GLOBAL_SEARCH_KINDS = [
  'project',
  'job',
  'work_order',
  'client',
  'contact',
  'employee',
  'vendor',
  'bill',
  'billing',
  'document',
  'asset',
  'boq_item',
] as const;

export type GlobalSearchKind = (typeof GLOBAL_SEARCH_KINDS)[number];

export interface GlobalSearchHit {
  readonly kind: GlobalSearchKind;
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly href: string;
}

export interface GlobalSearchResult {
  readonly query: string;
  readonly hits: readonly GlobalSearchHit[];
}
