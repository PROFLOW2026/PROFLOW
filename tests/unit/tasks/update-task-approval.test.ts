import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  findTaskById: vi.fn(),
  updateTaskById: vi.fn(),
  insertTaskActivity: vi.fn(),
  assertTaskCompletionApprovalSatisfied: vi.fn(),
}));

vi.mock('@/modules/tasks/data/tasks.repository', () => ({
  findTaskById: mocks.findTaskById,
  updateTaskById: mocks.updateTaskById,
  insertTaskActivity: mocks.insertTaskActivity,
}));

vi.mock('@/modules/tasks/application/submit-task-approval', () => ({
  assertTaskCompletionApprovalSatisfied: mocks.assertTaskCompletionApprovalSatisfied,
}));

vi.mock('@/modules/tasks/application/notify-task-followers', () => ({
  notifyTaskFollowersOfStatusChange: vi.fn().mockResolvedValue(undefined),
}));

const { findTaskById, updateTaskById, assertTaskCompletionApprovalSatisfied } = mocks;

import { updateTask } from '@/modules/tasks/application/update-task';

function orgContext(): OrgContext {
  return {
    userId: 'user-1',
    membershipId: 'mem-1',
    organizationId: 'org-1',
    locale: 'en',
    db: {} as OrgContext['db'],
    organization: { id: 'org-1', name: 'Org', timezone: 'UTC' } as OrgContext['organization'],
    permissions: new Set([PERMISSIONS.TASKS_UPDATE]),
    roleKeys: ['manager'],
  };
}

describe('updateTask approval gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findTaskById.mockResolvedValue({
      id: 'task-1',
      title: 'Gated',
      description: null,
      status: 'in_progress',
      priority: 'medium',
      dueDate: null,
      isArchived: false,
      approvalRequired: true,
      bucketId: null,
      contributesToProgress: false,
      progressWeight: null,
    });
    updateTaskById.mockResolvedValue({
      id: 'task-1',
      title: 'Gated',
      status: 'done',
    });
  });

  it('blocks status→done when approval is not satisfied', async () => {
    assertTaskCompletionApprovalSatisfied.mockRejectedValue(
      new DomainRuleError('needs approval', 'tasks.errors.approvalRequiredBeforeDone'),
    );

    await expect(
      updateTask(orgContext(), 'task-1', { status: 'done' }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    expect(assertTaskCompletionApprovalSatisfied).toHaveBeenCalledWith(
      expect.anything(),
      'task-1',
    );
    expect(updateTaskById).not.toHaveBeenCalled();
  });

  it('allows status→done when approval gate passes', async () => {
    assertTaskCompletionApprovalSatisfied.mockResolvedValue(undefined);

    await updateTask(orgContext(), 'task-1', { status: 'done' });

    expect(updateTaskById).toHaveBeenCalled();
  });
});
