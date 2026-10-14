import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/modules/tasks/application/assert-task-access', () => ({
  assertCanAccessTask: vi.fn(),
}));

vi.mock('@/modules/tasks/application/update-task', () => ({
  updateTask: vi.fn(),
}));

import { AuthorizationError } from '@/shared/errors';
import { assertCanAccessTask } from '@/modules/tasks/application/assert-task-access';
import { updateTask } from '@/modules/tasks/application/update-task';
import { bulkUpdateTasks } from '@/modules/tasks/application/bulk-update-tasks';

const context = {
  organizationId: 'org-1',
  membershipId: 'mem-1',
} as never;

describe('bulkUpdateTasks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns updated and failed counts per task', async () => {
    vi.mocked(assertCanAccessTask)
      .mockResolvedValueOnce({ id: 'a' } as never)
      .mockResolvedValueOnce({ id: 'b' } as never)
      .mockRejectedValueOnce(new AuthorizationError('task.view'))
      .mockRejectedValueOnce(new AuthorizationError('task.view'));

    vi.mocked(updateTask).mockResolvedValue({ id: 'a' } as never);

    const result = await bulkUpdateTasks(context, ['a', 'b', 'c', 'd'], {
      priority: 'high',
    });

    expect(result.updated).toBe(2);
    expect(result.failed).toHaveLength(2);
    expect(updateTask).toHaveBeenCalledTimes(2);
  });
});
