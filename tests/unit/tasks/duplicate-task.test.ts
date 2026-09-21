import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { duplicateTask } from '@/modules/tasks/application/duplicate-task';

vi.mock('@/shared/permissions/assert', () => ({
  assertPermission: vi.fn(),
}));

vi.mock('@/modules/tasks/domain/actor', () => ({
  buildActivityActorFieldsFromContext: vi.fn(() => ({ actorOrgMemberId: 'mem-1' })),
  buildCreatorFieldsFromContext: vi.fn(() => ({ createdByOrgMemberId: 'mem-1' })),
}));

vi.mock('@/modules/tasks/domain/lexorank', () => ({
  generateSortKey: vi.fn(() => 'sort-key-1'),
}));

const repo = vi.hoisted(() => ({
  getTaskDetail: vi.fn(),
  insertTask: vi.fn(),
  insertChecklistItem: vi.fn(),
  insertLabelAssignment: vi.fn(),
  insertTaskAssignee: vi.fn(),
  insertTaskActivity: vi.fn(),
  listLabelIdsForTask: vi.fn(),
}));

vi.mock('@/modules/tasks/data/tasks.repository', () => repo);

describe('duplicateTask', () => {
  const context = {
    db: {},
    organizationId: 'org-1',
    membershipId: 'mem-1',
  } as unknown as OrgContext;

  beforeEach(() => {
    vi.clearAllMocks();
    repo.getTaskDetail.mockResolvedValue({
      id: 'task-source',
      title: 'Install panels',
      description: 'Main floor',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      boardId: 'board-1',
      bucketId: 'bucket-1',
      priority: 'high',
      estimatedEffortMinutes: 120,
      milestoneId: null,
      checklistItems: [
        { id: 'cl-1', title: 'Measure', sortKey: 'a', isDone: true },
      ],
      assignees: [{ orgMemberId: 'mem-2', employeeId: null }],
    });
    repo.insertTask.mockResolvedValue({
      id: 'task-copy',
      title: 'Install panels (copy)',
    });
    repo.listLabelIdsForTask.mockResolvedValue(['label-1']);
  });

  it('copies core fields and checklist without assignees by default', async () => {
    const result = await duplicateTask(context, 'task-source');

    expect(result.id).toBe('task-copy');
    expect(repo.insertTask).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({
        title: 'Install panels (copy)',
        description: 'Main floor',
        projectId: 'proj-1',
        boardId: 'board-1',
        bucketId: 'bucket-1',
        priority: 'high',
        approvalRequired: false,
      }),
    );
    expect(repo.insertChecklistItem).toHaveBeenCalledTimes(1);
    expect(repo.insertLabelAssignment).toHaveBeenCalledWith(context.db, {
      taskId: 'task-copy',
      labelId: 'label-1',
      organizationId: 'org-1',
    });
    expect(repo.insertTaskAssignee).not.toHaveBeenCalled();
    expect(repo.insertTaskActivity).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({ eventType: 'task_duplicated', taskId: 'task-source' }),
    );
  });

  it('optionally copies assignees', async () => {
    await duplicateTask(context, 'task-source', { includeAssignees: true });

    expect(repo.insertTaskAssignee).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({
        taskId: 'task-copy',
        orgMemberId: 'mem-2',
      }),
    );
  });
});
