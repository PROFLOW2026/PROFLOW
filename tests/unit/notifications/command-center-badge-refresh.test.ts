import { describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { DomainRuleError } from '@/shared/errors';

const refreshActorAttentionBadge = vi.hoisted(() => vi.fn());
const upsertCommandCenterItemState = vi.hoisted(() => vi.fn());

vi.mock('@/modules/notifications/application/attention-badge', () => ({
  refreshActorAttentionBadge,
}));

vi.mock('@/modules/command-center/data/item-states.repository', () => ({
  upsertCommandCenterItemState,
}));

import { updateCommandCenterItemState } from '@/modules/command-center/application/update-item-state';

function actor(userId = 'actor-1'): OrgContext {
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
    permissions: new Set([PERMISSIONS.COMMAND_CENTER_READ, PERMISSIONS.NOTIFICATIONS_READ]),
    roleKeys: ['office'],
    db: {} as DbExecutor,
    locale: 'he',
  };
}

describe('command center actor badge refresh', () => {
  it('refreshes the acting user snapshot after their command-center item changes', async () => {
    refreshActorAttentionBadge.mockReset();
    upsertCommandCenterItemState.mockReset();
    refreshActorAttentionBadge.mockResolvedValue(undefined);
    upsertCommandCenterItemState.mockImplementation(async (_db: unknown, input: { userId?: string }) => ({
      id: 'state-1',
      ...input,
      createdAt: new Date('2026-11-08T00:00:00Z'),
      updatedAt: new Date('2026-11-08T00:00:00Z'),
    }));
    const context = actor('actor-1');

    const record = await updateCommandCenterItemState(context, {
      itemKey: 'open_approval:a1',
      sourceType: 'open_approval',
      sourceId: 'a1',
      state: 'dismissed',
    });

    expect(record.updatedByUserId).toBe('actor-1');
    expect(refreshActorAttentionBadge).toHaveBeenCalledTimes(1);
    expect(refreshActorAttentionBadge.mock.calls[0]?.[0]).toMatchObject({ userId: 'actor-1' });
    expect(refreshActorAttentionBadge.mock.calls[0]?.[0]).toBe(context);
  });

  it('keeps the state change when the badge refresh throws', async () => {
    refreshActorAttentionBadge.mockReset();
    upsertCommandCenterItemState.mockReset();
    refreshActorAttentionBadge.mockRejectedValue(Object.assign(new Error('permission denied'), { code: '42501' }));
    upsertCommandCenterItemState.mockImplementation(async (_db: unknown, input: object) => ({
      id: 'state-2',
      ...input,
    }));

    const record = await updateCommandCenterItemState(actor(), {
      itemKey: 'open_approval:a1',
      sourceType: 'open_approval',
      sourceId: 'a1',
      state: 'handled',
    });

    expect(record.id).toBe('state-2');
  });

  it('does not refresh when a financial dismiss is rejected', async () => {
    refreshActorAttentionBadge.mockReset();
    upsertCommandCenterItemState.mockReset();

    await expect(
      updateCommandCenterItemState(actor(), {
        itemKey: 'overdue_ar:b1',
        sourceType: 'overdue_ar',
        sourceId: 'b1',
        state: 'dismissed',
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    expect(upsertCommandCenterItemState).not.toHaveBeenCalled();
    expect(refreshActorAttentionBadge).not.toHaveBeenCalled();
  });
});
