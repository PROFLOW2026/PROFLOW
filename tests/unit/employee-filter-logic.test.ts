import { describe, expect, it } from 'vitest';
import {
  filterEmployeeTasks,
  parseTaskFilterState,
  projectMatchesQuery,
  type EmployeeTaskListItem,
} from '@/modules/employee-app/ui/employee-filter-logic';

const baseTask = (overrides: Partial<EmployeeTaskListItem>): EmployeeTaskListItem => ({
  id: 't1',
  title: 'Task',
  status: 'todo',
  priority: 'medium',
  dueDate: '2026-09-21',
  projectId: 'p1',
  projectDisplayName: 'CNS-27033 — Demo Project',
  assigneeLabel: 'Alex',
  assigneeEmployeeIds: ['e1'],
  canPostpone: true,
  ...overrides,
});

describe('employee-filter-logic', () => {
  it('defaults task filters to open tasks', () => {
    const filters = parseTaskFilterState(new URLSearchParams());
    expect(filters.status).toBe('open');
    expect(filters.time).toBe('all');
  });

  it('matches project number and name in one search box', () => {
    expect(projectMatchesQuery('CNS-27033 — Demo', '27033')).toBe(true);
    expect(projectMatchesQuery('CNS-27033 — Demo', 'CNS-270')).toBe(true);
    expect(projectMatchesQuery('CNS-27033 — Demo', 'demo')).toBe(true);
  });

  it('excludes completed tasks in default open filter', () => {
    const tasks = [
      baseTask({ id: 'open', status: 'todo' }),
      baseTask({ id: 'done', status: 'done' }),
    ];
    const filtered = filterEmployeeTasks(
      tasks,
      parseTaskFilterState(new URLSearchParams()),
      '2026-09-21' as never,
      'e1',
    );
    expect(filtered.map((task) => task.id)).toEqual(['open']);
  });
});
