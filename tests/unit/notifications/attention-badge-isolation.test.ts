import { describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { CommandCenterItem } from '@/modules/command-center/domain/types';
import { computeMergedAttentionCount } from '@/modules/notifications/application/attention-badge';

const listNotifications = vi.hoisted(() => vi.fn());
const getActionableInboxIfAllowed = vi.hoisted(() => vi.fn());

vi.mock('@/modules/notifications/application/list', () => ({
  listNotifications,
}));

vi.mock('@/modules/command-center/application/get-actionable-inbox', () => ({
  getActionableInboxIfAllowed,
}));

import { persistAttentionBadgeSnapshot } from '@/modules/notifications/application/attention-badge';
import { listMergedNotificationInbox } from '@/modules/notifications/application/actionable-inbox';
import { upsertAttentionBadgeSnapshot } from '@/modules/notifications/data/attention-badge-snapshot.repository';

function actorContext(db: DbExecutor, userId: string): OrgContext {
  return {
    userId,
    organizationId: 'org-1',
    membershipId: 'mem-1',
    organization: {
      id: 'org-1',
      name: 'Org',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he',
    },
    permissions: new Set([PERMISSIONS.NOTIFICATIONS_READ]),
    roleKeys: ['employee'],
    db,
    locale: 'he',
  };
}

function badgeDb(onWrite: (row: { userId: string }) => Promise<void> | void) {
  const insert = vi.fn(() => ({
    values: (row: { userId: string }) => ({
      onConflictDoUpdate: () => Promise.resolve(onWrite(row)).then(() => undefined),
    }),
  }));
  const tx = { insert };
  const db = {
    execute: vi.fn(async () => [{ present: true }]),
    insert: vi.fn(),
    transaction: vi.fn(async (fn: (inner: typeof tx) => Promise<void>) => fn(tx)),
  };
  return db;
}

describe('attention badge snapshot isolation', () => {
  it('writes only the acting user id', async () => {
    const written: string[] = [];
    const db = badgeDb((row) => {
      written.push(row.userId);
    });
    await upsertAttentionBadgeSnapshot(db as unknown as DbExecutor, 'org-1', 'actor-1', 3);
    await persistAttentionBadgeSnapshot(actorContext(db as unknown as DbExecutor, 'actor-2'), 4);
    expect(written).toEqual(['actor-1', 'actor-2']);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('returns the notification list when the snapshot upsert is denied', async () => {
    listNotifications.mockReset();
    getActionableInboxIfAllowed.mockReset();
    const inbox = { items: [{ id: 'n1' }], unreadCount: 1 };
    listNotifications.mockResolvedValue(inbox);
    getActionableInboxIfAllowed.mockResolvedValue(null);
    const db = badgeDb(() => {
      throw Object.assign(new Error('permission denied for table notification_attention_badge_snapshots'), {
        code: '42501',
      });
    });

    const result = await listMergedNotificationInbox(
      actorContext(db as unknown as DbExecutor, 'actor-1'),
    );

    expect(result).toEqual(inbox);
    expect(db.transaction).toHaveBeenCalled();
  });

  it('drops a cc: row from the attention count once it leaves the inbox', () => {
    const persisted = { items: [], unreadCount: 0 };
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
          itemKey: 'task:1',
          sourceType: 'open_approval' as const,
          sourceId: 'a1',
          what: 'Approval',
          href: '/approvals/a1',
          severity: 'low' as const,
          rankScore: 1,
        },
      ] satisfies CommandCenterItem[],
    };
    expect(computeMergedAttentionCount(persisted, actionable)).toBe(1);
    expect(computeMergedAttentionCount(persisted, null)).toBe(0);
    expect(computeMergedAttentionCount(persisted, { items: [] })).toBe(0);
  });
});
