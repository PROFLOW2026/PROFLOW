import { describe, expect, it } from 'vitest';
import { withItemDefaults } from '@/modules/command-center/domain/ranking';
import {
  ACTIONABLE_NOTIFICATION_ID_PREFIX,
  commandCenterItemToNotificationItem,
  isActionableNotificationId,
} from '@/modules/notifications/application/actionable-inbox';

describe('notification actionable inbox', () => {
  it('maps command-center items to live notification rows', () => {
    const item = withItemDefaults({
      sourceType: 'expense_due_today',
      sourceId: 'e1',
      what: 'הוצאה לתשלום היום',
      why: 'Vendor · 1000 ILS',
      where: 'הוצאות',
      href: '/expenses/e1',
      confirmPaid: 'expense',
    });

    const dto = commandCenterItemToNotificationItem(item);
    expect(dto.id).toBe(`${ACTIONABLE_NOTIFICATION_ID_PREFIX}expense_due_today:e1`);
    expect(dto.type).toBe('action_required');
    expect(dto.domain).toBe('ap');
    expect(dto.title).toBe('הוצאה לתשלום היום');
    expect(dto.deepLink).toBe('/expenses/e1');
    expect(dto.readAt).toBeNull();
  });

  it('recognizes actionable notification ids', () => {
    expect(isActionableNotificationId('cc:expense_overdue:e9')).toBe(true);
    expect(isActionableNotificationId('018f1234-5678-7abc-8def-0123456789aa')).toBe(false);
  });
});
