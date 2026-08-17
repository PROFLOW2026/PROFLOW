import type { OrgContext } from '@/shared/auth/context';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getModuleVisibility } from '@/modules/tenancy';
import { runNotificationScan } from '@/modules/notifications';
import { todayInTimeZone } from '@/shared/dates';
import { collectAllSources } from '../data/collect-sources';
import { listCommandCenterItemStates } from '../data/item-states.repository';
import { sortCommandCenterItems } from '../domain/ranking';
import type {
  CommandCenterInbox,
  CommandCenterItem,
  CommandCenterItemStateRecord,
} from '../domain/types';

const MAX_INBOX_ITEMS = 80;

function isHiddenByState(
  state: CommandCenterItemStateRecord | undefined,
  now: Date,
): boolean {
  if (!state) return false;
  if (state.state === 'handled' || state.state === 'dismissed') return true;
  if (state.state === 'snoozed') {
    if (!state.snoozedUntil) return true;
    return state.snoozedUntil.getTime() > now.getTime();
  }
  return false;
}

/**
 * Aggregates actionable Today items for anyone with `command_center.read`.
 * Visibility is permission-gated, not an optional-module toggle.
 */
export async function getTodayInbox(context: OrgContext): Promise<CommandCenterInbox> {
  assertPermission(context, PERMISSIONS.COMMAND_CENTER_READ);

  const modules = await getModuleVisibility(context);

  const today = todayInTimeZone(context.organization.timezone);
  const now = new Date();

  const scanPromise = hasPermission(context, PERMISSIONS.NOTIFICATIONS_READ)
    ? runNotificationScan(context, { maxMs: 2500, perScannerCap: 12 }).catch(() => null)
    : Promise.resolve(null);

  const [rawItems, states] = await Promise.all([
    collectAllSources({ context, modules, today }),
    listCommandCenterItemStates(context.db, context.organizationId),
    scanPromise,
  ]);

  const stateByKey = new Map(states.map((row) => [row.itemKey, row]));
  let hiddenByState = 0;
  const visible: CommandCenterItem[] = [];

  for (const item of rawItems) {
    const state = stateByKey.get(item.itemKey);
    if (isHiddenByState(state, now)) {
      hiddenByState += 1;
      continue;
    }
    visible.push(item);
  }

  const items = sortCommandCenterItems(visible).slice(0, MAX_INBOX_ITEMS);

  return {
    items,
    totalActive: items.length,
    hiddenByState,
  };
}
