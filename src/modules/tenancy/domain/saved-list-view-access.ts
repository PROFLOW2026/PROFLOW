import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { SavedListViewRecord } from './saved-list-views';

/**
 * Organization-scoped saved views use the same org-admin gate as dashboard quick access
 * and other org-wide preferences (`SETTINGS_MANAGE`).
 */
export function canCreateOrganizationSavedListView(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.SETTINGS_MANAGE);
}

export function canMutateSavedListView(context: OrgContext, view: SavedListViewRecord): boolean {
  if (view.scope === 'private') return view.userId === context.userId;
  if (view.userId === context.userId) return true;
  return hasPermission(context, PERMISSIONS.SETTINGS_MANAGE);
}
