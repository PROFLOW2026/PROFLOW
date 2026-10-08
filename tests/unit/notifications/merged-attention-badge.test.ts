import { describe, expect, it } from 'vitest';
import type { CommandCenterItem } from '@/modules/command-center/domain/types';
import { computeMergedAttentionCount } from '@/modules/notifications/application/attention-badge';

describe('merged attention badge count', () => {
  it('counts actionable items plus persisted unread after deep-link dedupe', () => {
    const persisted = {
      unreadCount: 1,
      items: [
        {
          id: 'n1',
          type: 'billing_overdue' as const,
          domain: 'billing' as const,
          entityType: 'billing',
          entityId: 'b1',
          title: 'Due',
          body: 'body',
          severity: 'warning' as const,
          deepLink: '/billing/b1',
          readAt: null,
          createdAt: new Date('2026-01-01'),
          metadata: null,
        },
      ],
    };
    const ccBase = {
      why: 'why',
      where: 'where',
      isFinancial: false,
      allowHandle: true,
      allowSnooze: true,
    } as const;
    const actionable = {
      items: [
        {
          ...ccBase,
          itemKey: 'cc1',
          sourceType: 'overdue_ar' as const,
          sourceId: 'ar1',
          what: 'AR',
          href: '/billing/b1',
          severity: 'high' as const,
          rankScore: 10,
        },
        {
          ...ccBase,
          itemKey: 'cc2',
          sourceType: 'open_approval' as const,
          sourceId: 'a1',
          what: 'Approval',
          href: '/approvals/a1',
          severity: 'low' as const,
          rankScore: 5,
        },
      ] satisfies CommandCenterItem[],
    };
    expect(computeMergedAttentionCount(persisted, actionable)).toBe(2);
  });
});
