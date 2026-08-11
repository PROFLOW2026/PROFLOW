import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getModuleVisibility } from '@/modules/tenancy';
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
 * Aggregates actionable Command Center items for owners/managers.
 * Requires `command_center.read`. Optional module must be on (nav + page).
 */
export async function getTodayInbox(context: OrgContext): Promise<CommandCenterInbox> {
  assertPermission(context, PERMISSIONS.COMMAND_CENTER_READ);

  const modules = await getModuleVisibility(context);
  if (!modules.command_center) {
    throw new DomainRuleError(
      'Command Center module is not enabled for this organization',
      'commandCenter.errors.moduleOff',
    );
  }

  const today = todayInTimeZone(context.organization.timezone);
  const now = new Date();

  const [rawItems, states] = await Promise.all([
    collectAllSources({ context, modules, today }),
    listCommandCenterItemStates(context.db, context.organizationId),
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
