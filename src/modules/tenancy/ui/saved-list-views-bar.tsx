import {
  compactSearchQuery,
  listSavedListViews,
  type SavedListKey,
} from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { SavedListViewsControl } from './saved-list-views-control';

export async function SavedListViewsBar({
  listKey,
  searchParams,
  keys,
}: {
  listKey: SavedListKey;
  searchParams: Record<string, string | string[] | undefined>;
  keys?: readonly string[];
}) {
  const currentQuery = compactSearchQuery(searchParams, keys);
  const views = await withOrgContext((context) => listSavedListViews(context, listKey));

  return (
    <SavedListViewsControl listKey={listKey} currentQuery={currentQuery} views={views} />
  );
}
