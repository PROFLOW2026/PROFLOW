import { describe, expect, it } from 'vitest';
import { parseBoardTaskListFilters } from '@/modules/tasks/application/parse-board-task-list-filters';

describe('parseBoardTaskListFilters', () => {
  it('maps URL params to list filters', () => {
    expect(
      parseBoardTaskListFilters({
        status: 'in_progress',
        priority: 'high',
        bucketId: 'b1',
        overdue: 'true',
        dueFrom: '2026-01-01',
        dueTo: '2026-01-31',
      }),
    ).toEqual({
      status: 'in_progress',
      priority: 'high',
      bucketId: 'b1',
      overdue: true,
      dueAfter: '2026-01-01',
      dueBefore: '2026-01-31',
    });
  });

  it('ignores invalid enum values', () => {
    expect(parseBoardTaskListFilters({ status: 'not_a_status', priority: 'x' })).toEqual({});
  });

  it('maps assignee and label filters', () => {
    expect(
      parseBoardTaskListFilters({
        assigneeOrgMemberId: 'm1',
        assigneeEmployeeId: 'e1',
        labelId: 'lbl1',
      }),
    ).toEqual({
      assigneeOrgMemberId: 'm1',
      assigneeEmployeeId: 'e1',
      labelId: 'lbl1',
    });
  });
});
