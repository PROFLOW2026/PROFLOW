import { describe, expect, it, vi, beforeEach } from 'vitest';
import type * as NotificationsRepository from '@/modules/notifications/data/notifications.repository';

vi.mock('server-only', () => ({}));

const { listUnresolved, resolveRpc } = vi.hoisted(() => ({
  listUnresolved: vi.fn(),
  resolveRpc: vi.fn(),
}));

vi.mock('@/modules/notifications/data/notifications.repository', async (importOriginal) => {
  const actual = await importOriginal<typeof NotificationsRepository>();
  return {
    ...actual,
    listUnresolvedEntityIdsForTypeAndEntityType: listUnresolved,
    resolveNotificationsRpc: resolveRpc,
  };
});

import { resolveStaleNotificationsForEntityType } from '@/modules/notifications/application/scan-stale';

describe('overdue scan isolation', () => {
  beforeEach(() => {
    listUnresolved.mockReset();
    resolveRpc.mockReset();
  });

  it('does not resolve task notifications when resolving planning work items', async () => {
    listUnresolved.mockResolvedValue(['plan-a']);
    resolveRpc.mockResolvedValue(1);

    const context = { db: {} as never, organizationId: 'org-1' } as never;
    const resolved = await resolveStaleNotificationsForEntityType(
      context,
      'task_overdue',
      'planning_work_item',
      new Set(['plan-a']),
    );

    expect(resolved).toBe(0);
    expect(listUnresolved).toHaveBeenCalledWith({} as never, 'org-1', 'task_overdue', 'planning_work_item');
    expect(resolveRpc).not.toHaveBeenCalled();

    listUnresolved.mockResolvedValue(['plan-a', 'plan-stale']);
    resolveRpc.mockResolvedValue(1);
    const resolvedStale = await resolveStaleNotificationsForEntityType(
      context,
      'task_overdue',
      'planning_work_item',
      new Set(['plan-a']),
    );
    expect(resolvedStale).toBe(1);
    expect(resolveRpc).toHaveBeenCalledWith({} as never, 'org-1', 'task_overdue', 'plan-stale');
  });
});
