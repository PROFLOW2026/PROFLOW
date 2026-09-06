import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { runNotificationScan } from '@/modules/notifications';
import type { CommandCenterInbox } from '../domain/types';
import { getActionableInbox } from './get-actionable-inbox';

/**
 * Aggregates actionable Today items for anyone with `command_center.read`.
 * Visibility is permission-gated, not an optional-module toggle.
 */
export async function getTodayInbox(context: OrgContext): Promise<CommandCenterInbox> {
  const scanPromise = hasPermission(context, PERMISSIONS.NOTIFICATIONS_READ)
    ? runNotificationScan(context, { maxMs: 2500, perScannerCap: 12 }).catch(() => null)
    : Promise.resolve(null);

  const [inbox] = await Promise.all([getActionableInbox(context), scanPromise]);
  return inbox;
}
