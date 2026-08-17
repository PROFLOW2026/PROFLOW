import { describe, expect, it } from 'vitest';
import {
  EVENT_DOMAIN,
  NOTIFICATION_EVENT_TYPES,
  isNotificationEventType,
} from '@/modules/notifications/domain/types';
import { notificationCopy } from '@/modules/notifications/domain/copy';

describe('next-gen notification event types', () => {
  it('registers warranty, closeout, communication, and automation events', () => {
    expect(NOTIFICATION_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        'warranty_expiring',
        'closeout_blockers',
        'communication_failed',
        'automation_output',
      ]),
    );
    expect(isNotificationEventType('warranty_expiring')).toBe(true);
    expect(isNotificationEventType('closeout_blockers')).toBe(true);
    expect(isNotificationEventType('communication_failed')).toBe(true);
    expect(isNotificationEventType('automation_output')).toBe(true);
    expect(EVENT_DOMAIN.warranty_expiring).toBe('warranty');
    expect(EVENT_DOMAIN.closeout_blockers).toBe('closeout');
    expect(EVENT_DOMAIN.communication_failed).toBe('communications');
    expect(EVENT_DOMAIN.automation_output).toBe('automations');
  });

  it('uses issued/product copy without developer text', () => {
    const warranty = notificationCopy('en', 'warranty_expiring', {
      reference: 'Roof',
      extra: '2026-09-01',
    });
    expect(warranty.title).toContain('Roof');
    expect(warranty.body).toContain('2026-09-01');

    const failed = notificationCopy('he-IL', 'communication_failed', { reference: 'Quote' });
    expect(failed.title).toContain('Quote');
    expect(failed.body).not.toMatch(/TODO|FIXME|lorem/i);
  });
});
