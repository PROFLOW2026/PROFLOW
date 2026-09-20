import { describe, expect, it, vi } from 'vitest';
import {
  assigneeDisplaysForTask,
  loadTaskAssigneeDisplayMap,
} from '@/modules/tasks/application/enrich-task-assignees';

describe('task assignee display enrichment', () => {
  it('maps employee and org-member assignees by task id', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              {
                taskId: 'task-1',
                employeeId: 'emp-yael',
                orgMemberId: null,
                employeeName: 'Yael Cohen',
                memberDisplayName: null,
                memberEmail: null,
              },
              {
                taskId: 'task-2',
                employeeId: null,
                orgMemberId: 'mem-owner',
                employeeName: null,
                memberDisplayName: 'Owner User',
                memberEmail: 'owner@example.com',
              },
            ]),
          }),
        }),
      }),
    };

    const map = await loadTaskAssigneeDisplayMap(db as never, 'org-1', ['task-1', 'task-2']);

    expect(assigneeDisplaysForTask('task-1', map)).toEqual([
      { id: 'emp-yael', displayName: 'Yael Cohen', avatarUrl: null },
    ]);
    expect(assigneeDisplaysForTask('task-2', map)).toEqual([
      { id: 'mem-owner', displayName: 'Owner User', avatarUrl: null },
    ]);
  });
});
