import { describe, expect, it } from 'vitest';
import {
  defaultTaskFilterState,
  filterEmployeeTasks,
  isTaskFilterActive,
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
  it('defaults management scope to all company tasks', () => {
    const defaults = defaultTaskFilterState(true);
    expect(defaults.scope).toBe('company');
    expect(defaults.status).toBe('open');
  });

  it('defaults regular employee scope to mine', () => {
    const defaults = defaultTaskFilterState(false);
    expect(defaults.scope).toBe('mine');
  });

  it('matches project number and name in one search box', () => {
    expect(projectMatchesQuery('CNS-27033 — Demo', '27033')).toBe(true);
    expect(projectMatchesQuery('CNS-27033 — Demo', 'CNS-270')).toBe(true);
    expect(projectMatchesQuery('CNS-27033 — Demo', 'demo')).toBe(true);
  });

  it('excludes completed tasks in default open filter', () => {
    const defaults = defaultTaskFilterState(true);
    const tasks = [baseTask({ id: 'open', status: 'todo' }), baseTask({ id: 'done', status: 'done' })];
    const filtered = filterEmployeeTasks(tasks, defaults, '2026-09-21' as never, 'e1');
    expect(filtered.map((task) => task.id)).toEqual(['open']);
  });

  it('filters by canonical status values', () => {
    const defaults = defaultTaskFilterState(true);
    const tasks = [
      baseTask({ id: 'todo', status: 'todo' }),
      baseTask({ id: 'progress', status: 'in_progress' }),
      baseTask({ id: 'review', status: 'in_review' }),
      baseTask({ id: 'blocked', status: 'blocked' }),
    ];
    const filtered = filterEmployeeTasks(
      tasks,
      { ...defaults, status: 'in_progress' },
      '2026-09-21' as never,
      'e1',
    );
    expect(filtered.map((task) => task.id)).toEqual(['progress']);
  });

  it('scope mine shows only assigned tasks', () => {
    const defaults = defaultTaskFilterState(true);
    const tasks = [
      baseTask({ id: 'mine', assigneeEmployeeIds: ['e1'] }),
      baseTask({ id: 'other', assigneeEmployeeIds: ['e2'] }),
    ];
    const filtered = filterEmployeeTasks(
      tasks,
      { ...defaults, scope: 'mine' },
      '2026-09-21' as never,
      'e1',
    );
    expect(filtered.map((task) => task.id)).toEqual(['mine']);
  });

  it('detects active filters against defaults', () => {
    const defaults = defaultTaskFilterState(true);
    const applied = parseTaskFilterState(new URLSearchParams('status=done'), true);
    expect(isTaskFilterActive(applied, defaults)).toBe(true);
  });
});
