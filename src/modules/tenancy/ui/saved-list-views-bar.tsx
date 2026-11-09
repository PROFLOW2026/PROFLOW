import {
  compactSearchQuery,
  listSavedListViews,
  type SavedListKey,
} from '@/modules/tenancy';
import { canCreateOrganizationSavedListView } from '@/modules/tenancy/domain/saved-list-view-access';
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
  const { views, currentUserId, canShareWithOrganization } = await withOrgContext(async (context) => ({
    views: await listSavedListViews(context, listKey),
    currentUserId: context.userId,
    canShareWithOrganization: canCreateOrganizationSavedListView(context),
  }));

  return (
    <SavedListViewsControl
      listKey={listKey}
      currentQuery={currentQuery}
      views={views}
      currentUserId={currentUserId}
      canShareWithOrganization={canShareWithOrganization}
    />
  );
}
