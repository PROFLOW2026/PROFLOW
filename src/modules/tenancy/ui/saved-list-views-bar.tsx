import { type SavedListKey } from '@/modules/tenancy';

export async function SavedListViewsBar({
  listKey,
  searchParams,
  keys,
}: {
  listKey: SavedListKey;
  searchParams: Record<string, string | string[] | undefined>;
  keys?: readonly string[];
}) {
  // Owner decision: saved-view controls stay out of the UI. Rows, API, and
  // preferences remain. Call sites keep passing the current query.
  void listKey;
  void searchParams;
  void keys;
  return null;
}
