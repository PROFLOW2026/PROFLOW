import { describe, expect, it, vi } from 'vitest';
import { queryMyWork } from '@/modules/tasks/data/my-work.repository';

describe('my work assigned_to_me', () => {
  it('matches org member and employee assignees without duplicates', async () => {
    const taskRows = [{ id: 'task-1', title: 'Example' }];
    const selectMock = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { taskId: 'task-1' },
            { taskId: 'task-1' },
          ]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(taskRows),
              }),
            }),
          }),
        }),
      });

    const db = { select: selectMock };

    const tasks = await queryMyWork(db as never, {
      orgMemberId: 'mem-1',
      assigneeEmployeeId: 'emp-1',
      organizationId: 'org-1',
      workspaceIds: ['ws-1'],
      view: 'assigned_to_me',
      limit: 10,
    });

    expect(tasks).toHaveLength(1);
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it('returns empty when no assignee identity is available', async () => {
    const db = { select: vi.fn() };

    const tasks = await queryMyWork(db as never, {
      orgMemberId: '',
      assigneeEmployeeId: null,
      organizationId: 'org-1',
      workspaceIds: ['ws-1'],
      view: 'assigned_to_me',
    });

    expect(tasks).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });
});
