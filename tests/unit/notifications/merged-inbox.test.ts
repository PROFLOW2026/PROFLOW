import { describe, expect, it } from 'vitest';
import { withItemDefaults } from '@/modules/command-center/domain/ranking';
import {
  actionableReplacesPersistedNotification,
  buildMergedNotificationInbox,
} from '@/modules/notifications/application/merged-inbox';
import type { NotificationInbox, NotificationListItem } from '@/modules/notifications/domain/types';

function persistedBilling(id: string, reference: string): NotificationListItem {
  return {
    id: `n-${id}`,
    type: 'billing_overdue',
    domain: 'billing',
    entityType: 'billing_record',
    entityId: id,
    title: `חיוב ${reference} באיחור`,
    body: 'יתרה פתוחה',
    severity: 'urgent',
    deepLink: `/billing/${id}`,
    readAt: null,
    createdAt: new Date('2026-04-02'),
    metadata: null,
  };
}

describe('buildMergedNotificationInbox', () => {
  it('keeps persisted billing_overdue when Command Center does not surface the same record', () => {
    const persisted: NotificationInbox = {
      items: [persistedBilling('br-0015', '0015')],
      unreadCount: 1,
    };

    const merged = buildMergedNotificationInbox(persisted, {
      items: [
        withItemDefaults({
          sourceType: 'expense_pending_payment',
          sourceId: 'exp-1',
          what: 'הוצאה ממתינה',
          why: 'אישור תשלום',
          where: 'הוצאות',
          href: '/expenses/exp-1?focus=payment',
        }),
      ],
    });

    expect(merged.items.some((item) => item.entityId === 'br-0015')).toBe(true);
  });

  it('replaces persisted billing_overdue when overdue_ar covers the same billing record', () => {
    const persisted: NotificationInbox = {
      items: [persistedBilling('br-0015', '0015')],
      unreadCount: 1,
    };

    const merged = buildMergedNotificationInbox(persisted, {
      items: [
        withItemDefaults({
          sourceType: 'overdue_ar',
          sourceId: 'br-0015',
          what: 'חיוב 0015',
          why: 'מועד 2026-04-01 · 8,850.00 ₪',
          where: 'Brandeis 6',
          href: '/billing/br-0015',
        }),
      ],
    });

    const billingRows = merged.items.filter((item) => item.entityId === 'br-0015');
    expect(billingRows).toHaveLength(1);
    expect(billingRows[0]?.id).toMatch(/^cc:/);
  });
});

describe('actionableReplacesPersistedNotification', () => {
  it('does not suppress billing_overdue on deepLink match alone without overdue_ar entity', () => {
    const persisted = persistedBilling('br-0015', '0015');
    const replaced = actionableReplacesPersistedNotification(persisted, [
      withItemDefaults({
        sourceType: 'overdue_ar',
        sourceId: 'br-0099',
        what: 'other',
        why: 'other',
        where: 'x',
        href: '/billing/br-0099',
      }),
    ]);
    expect(replaced).toBe(false);
  });
});
