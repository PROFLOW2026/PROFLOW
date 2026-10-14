import { describe, expect, it } from 'vitest';
import { WORK_TASK_QUERY_KEYS } from '@/modules/tasks/domain/work-task-filter-keys';
import { parseWorkTaskListFilters } from '@/modules/tasks/domain/work-task-search-params';

describe('work lens URL filters', () => {
  it('maps every WORK_TASK_QUERY_KEYS entry into TaskListFilters', () => {
    const params = Object.fromEntries(
      WORK_TASK_QUERY_KEYS.map((key) => [key, sampleValue(key)]),
    );

    const filters = parseWorkTaskListFilters(params);

    expect(filters.projectId).toBe('proj-1');
    expect(filters.clientId).toBe('client-1');
    expect(filters.assigneeOrgMemberId).toBe('mem-1');
    expect(filters.assigneeEmployeeId).toBe('emp-1');
    expect(filters.status).toBe('in_progress');
    expect(filters.priority).toBe('urgent');
    expect(filters.labelId).toBe('label-1');
    expect(filters.search).toBe('pour');
    expect(filters.dueAfter).toBe('2026-10-01');
    expect(filters.dueBefore).toBe('2026-10-31');
    expect(filters.overdue).toBe(true);
    expect(filters.blocked).toBe(true);
    expect(filters.noProjectOnly).toBe(true);
    expect(filters.sort).toEqual({ field: 'dueDate', direction: 'desc' });
  });
});

function sampleValue(key: (typeof WORK_TASK_QUERY_KEYS)[number]): string {
  switch (key) {
    case 'projectId':
      return 'proj-1';
    case 'clientId':
      return 'client-1';
    case 'assigneeOrgMemberId':
      return 'mem-1';
    case 'assigneeEmployeeId':
      return 'emp-1';
    case 'status':
      return 'in_progress';
    case 'priority':
      return 'urgent';
    case 'labelId':
      return 'label-1';
    case 'search':
      return 'pour';
    case 'dueFrom':
      return '2026-10-01';
    case 'dueTo':
      return '2026-10-31';
    case 'overdue':
      return '1';
    case 'blocked':
      return 'true';
    case 'noProject':
      return '1';
    case 'sortField':
      return 'dueDate';
    case 'sortDir':
      return 'desc';
    default:
      return 'x';
  }
}
