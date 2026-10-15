import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/shared/permissions/assert', () => ({
  assertPermission: vi.fn(),
}));

vi.mock('@/modules/tasks/data/tasks.repository', () => ({
  findTaskById: vi.fn(),
  updateTaskById: vi.fn(),
  insertTaskActivity: vi.fn(),
}));

vi.mock('@/modules/tasks/domain/actor', () => ({
  buildActivityActorFieldsFromContext: vi.fn(() => ({
    actorOrgMemberId: 'mem-1',
    actorEmployeeId: null,
    actorSystem: false,
  })),
}));

import { findTaskById, updateTaskById, insertTaskActivity } from '@/modules/tasks/data/tasks.repository';
import { unarchiveTask } from '@/modules/tasks/application/unarchive-task';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';

const context = {
  organizationId: 'org-1',
  membershipId: 'mem-1',
  db: {} as DbExecutor,
} as OrgContext;

describe('unarchiveTask', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('clears archive flags and logs activity', async () => {
    vi.mocked(findTaskById).mockResolvedValue({
      id: 't1',
      isArchived: true,
    } as never);
    vi.mocked(updateTaskById).mockResolvedValue({
      id: 't1',
      isArchived: false,
    } as never);

    const result = await unarchiveTask(context, 't1');

    expect(result.isArchived).toBe(false);
    expect(updateTaskById).toHaveBeenCalledWith(
      context.db,
      'org-1',
      't1',
      expect.objectContaining({
        isArchived: false,
        archivedAt: null,
        archivedByOrgMemberId: null,
      }),
    );
    expect(insertTaskActivity).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({
        taskId: 't1',
        eventType: 'automation_changed',
        payload: { action: 'unarchived' },
      }),
    );
  });

  it('is idempotent when task is already active', async () => {
    const active = { id: 't2', isArchived: false } as never;
    vi.mocked(findTaskById).mockResolvedValue(active);

    const result = await unarchiveTask(context, 't2');

    expect(result).toBe(active);
    expect(updateTaskById).not.toHaveBeenCalled();
  });
});
