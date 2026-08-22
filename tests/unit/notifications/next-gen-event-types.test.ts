import { describe, expect, it } from 'vitest';
import {
  EVENT_DOMAIN,
  NOTIFICATION_EVENT_TYPES,
  isNotificationEventType,
} from '@/modules/notifications/domain/types';
import { notificationCopy } from '@/modules/notifications/domain/copy';

describe('next-gen notification event types', () => {
  it('registers warranty, closeout, communication, automation, and billing-plan events', () => {
    expect(NOTIFICATION_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        'warranty_expiring',
        'closeout_blockers',
        'communication_failed',
        'automation_output',
        'billing_plan_cycle_draft',
        'billing_plan_milestone_due',
        'billing_plan_retention_held',
      ]),
    );
    expect(isNotificationEventType('warranty_expiring')).toBe(true);
    expect(isNotificationEventType('closeout_blockers')).toBe(true);
    expect(isNotificationEventType('communication_failed')).toBe(true);
    expect(isNotificationEventType('automation_output')).toBe(true);
    expect(isNotificationEventType('billing_plan_cycle_draft')).toBe(true);
    expect(isNotificationEventType('billing_plan_milestone_due')).toBe(true);
    expect(isNotificationEventType('billing_plan_retention_held')).toBe(true);
    expect(EVENT_DOMAIN.warranty_expiring).toBe('warranty');
    expect(EVENT_DOMAIN.closeout_blockers).toBe('closeout');
    expect(EVENT_DOMAIN.communication_failed).toBe('communications');
    expect(EVENT_DOMAIN.automation_output).toBe('automations');
    expect(EVENT_DOMAIN.billing_plan_cycle_draft).toBe('billing');
    expect(EVENT_DOMAIN.billing_plan_milestone_due).toBe('billing');
    expect(EVENT_DOMAIN.billing_plan_retention_held).toBe('billing');
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

    const draftHe = notificationCopy('he-IL', 'billing_plan_cycle_draft', {
      reference: 'חשבון 3',
      extra: 'ready',
    });
    expect(draftHe.title).toContain('חשבון 3');
    expect(draftHe.body).toMatch(/[\u0590-\u05FF]/);

    const retentionHe = notificationCopy('he-IL', 'billing_plan_retention_held', {
      reference: 'תוכנית',
      extra: '1000 ILS',
    });
    expect(retentionHe.title).toContain('עיכבון');
    expect(retentionHe.body).toContain('1000 ILS');
  });
});
