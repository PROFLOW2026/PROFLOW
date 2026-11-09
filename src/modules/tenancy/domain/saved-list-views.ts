/**
 * Per-user saved filters on major lists. Not a BI catalog.
 */

export const SAVED_LIST_KEYS = [
  'projects',
  'jobs',
  'work_orders',
  'clients',
  'vendors',
  'expenses',
  'ap_bills',
  'quotes',
  'punch',
  'inventory',
  'portfolio',
  'workload',
  'tasks',
] as const;

export type SavedListKey = (typeof SAVED_LIST_KEYS)[number];

export const SAVED_LIST_VIEW_NAME_MAX = 60;
export const SAVED_LIST_VIEW_QUERY_KEY_MAX = 32;
export const SAVED_LIST_VIEW_QUERY_VALUE_MAX = 200;
export const SAVED_LIST_VIEW_QUERY_KEYS_MAX = 20;
export const SAVED_LIST_VIEWS_PER_LIST_MAX = 30;

export const SAVED_LIST_VIEW_SCOPES = ['private', 'organization'] as const;
export type SavedListViewScope = (typeof SAVED_LIST_VIEW_SCOPES)[number];

export interface SavedListViewRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly listKey: SavedListKey;
  readonly name: string;
  readonly query: Readonly<Record<string, string>>;
  readonly isDefault: boolean;
  readonly scope: SavedListViewScope;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Merges private and organization-scoped lists without duplicate ids (org wins on collision). */
export function mergeSavedListViewsForListing(
  privateViews: readonly SavedListViewRecord[],
  organizationViews: readonly SavedListViewRecord[],
): SavedListViewRecord[] {
  const byId = new Map<string, SavedListViewRecord>();
  for (const view of privateViews) byId.set(view.id, view);
  for (const view of organizationViews) byId.set(view.id, view);
  return [...byId.values()].sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });
}

export function isSavedListKey(value: string): value is SavedListKey {
  return (SAVED_LIST_KEYS as readonly string[]).includes(value);
}

/** Drops empty values so saved views stay comparable to the current URL. */
export function compactSearchQuery(
  params: Record<string, string | string[] | undefined>,
  keys?: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const source = keys ?? Object.keys(params);
  for (const key of source) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string' && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}

export function queriesMatch(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key] && rightKeys.includes(key));
}
