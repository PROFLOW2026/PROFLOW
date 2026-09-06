import type { OrgContext } from '@/shared/auth/context';
import type { CommandCenterItem, CommandCenterSeverity } from '@/modules/command-center/domain/types';
import { getActionableInboxIfAllowed } from '@/modules/command-center/application/get-actionable-inbox';
import type {
  NotificationDomain,
  NotificationInbox,
  NotificationListItem,
  NotificationSeverity,
} from '../domain/types';
import { listNotifications } from './list';

export const ACTIONABLE_NOTIFICATION_ID_PREFIX = 'cc:';

function severityToNotification(severity: CommandCenterSeverity): NotificationSeverity {
  if (severity === 'critical') return 'urgent';
  if (severity === 'high') return 'warning';
  return 'info';
}

function domainForSourceType(sourceType: string): NotificationDomain {
  if (sourceType.startsWith('expense_') || sourceType.includes('vendor_bill')) return 'ap';
  if (
    sourceType.startsWith('payroll_') ||
    sourceType.includes('attendance') ||
    sourceType.includes('timesheet')
  ) {
    return 'workforce';
  }
  if (sourceType.includes('billing') || sourceType === 'overdue_ar') return 'billing';
  if (sourceType.includes('approval')) return 'approvals';
  if (sourceType.includes('boq')) return 'boq';
  if (sourceType.includes('safety')) return 'safety';
  if (sourceType.includes('warranty') || sourceType.includes('closeout')) return 'closeout';
  if (sourceType.includes('communication')) return 'communications';
  if (sourceType.includes('automation')) return 'automations';
  if (sourceType.includes('document') || sourceType.includes('compliance')) return 'documents';
  if (sourceType.includes('planning') || sourceType.includes('task')) return 'planning';
  return 'approvals';
}

export function commandCenterItemToNotificationItem(item: CommandCenterItem): NotificationListItem {
  return {
    id: `${ACTIONABLE_NOTIFICATION_ID_PREFIX}${item.itemKey}`,
    type: 'action_required',
    domain: domainForSourceType(item.sourceType),
    entityType: item.sourceType,
    entityId: item.sourceId,
    title: item.what,
    body: `${item.why} · ${item.where}`,
    severity: severityToNotification(item.severity),
    deepLink: item.href,
    readAt: null,
    createdAt: new Date(),
  };
}

export function isActionableNotificationId(id: string): boolean {
  return id.startsWith(ACTIONABLE_NOTIFICATION_ID_PREFIX);
}

export async function listMergedNotificationInbox(context: OrgContext): Promise<NotificationInbox> {
  const [persisted, actionable] = await Promise.all([
    listNotifications(context),
    getActionableInboxIfAllowed(context),
  ]);

  if (!actionable) {
    return persisted;
  }

  const actionableItems = actionable.items.map(commandCenterItemToNotificationItem);
  const actionableLinks = new Set(actionable.items.map((item) => item.href));
  const filteredPersisted = persisted.items.filter(
    (item) => !item.deepLink || !actionableLinks.has(item.deepLink),
  );

  const merged = sortMergedItems([...actionableItems, ...filteredPersisted]);
  const unreadCount = merged.filter((item) => !item.readAt).length;
  return { items: merged, unreadCount };
}

function sortMergedItems(items: readonly NotificationListItem[]): NotificationListItem[] {
  const severityWeight: Record<NotificationSeverity, number> = {
    urgent: 3,
    warning: 2,
    info: 1,
  };
  return [...items].sort((a, b) => {
    const severityDelta = severityWeight[b.severity] - severityWeight[a.severity];
    if (severityDelta !== 0) return severityDelta;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}
