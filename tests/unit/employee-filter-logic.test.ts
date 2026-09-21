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
  it('defaults authorized project/org scope to all server-visible open tasks', () => {
    const defaults = defaultTaskFilterState(true);
    expect(defaults.scope).toBe('company');
    expect(defaults.status).toBe('open');
  });

  it('defaults self-only scope to mine', () => {
    const defaults = defaultTaskFilterState(false);
    expect(defaults.scope).toBe('mine');
  });

  it('keeps home-visible project tasks visible on the default tasks page filter', () => {
    const defaults = defaultTaskFilterState(true);
    const tasks = [
      baseTask({ id: 'assigned', assigneeEmployeeIds: ['e1'] }),
      baseTask({ id: 'project-open', assigneeEmployeeIds: ['e2'] }),
      baseTask({ id: 'done', status: 'done' }),
    ];
    const filtered = filterEmployeeTasks(tasks, defaults, '2026-09-21' as never, 'e1');
    expect(filtered.map((task) => task.id)).toEqual(['assigned', 'project-open']);
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

  it('filters each canonical status independently', () => {
    const defaults = defaultTaskFilterState(true);
    const tasks = [
      baseTask({ id: 'todo', status: 'todo' }),
      baseTask({ id: 'progress', status: 'in_progress' }),
      baseTask({ id: 'review', status: 'in_review' }),
      baseTask({ id: 'blocked', status: 'blocked' }),
      baseTask({ id: 'done', status: 'done' }),
      baseTask({ id: 'cancelled', status: 'cancelled' }),
    ];

    const idByStatus = {
      todo: 'todo',
      in_progress: 'progress',
      in_review: 'review',
      blocked: 'blocked',
      done: 'done',
      cancelled: 'cancelled',
    } as const;

    for (const status of ['todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled'] as const) {
      const filtered = filterEmployeeTasks(
        tasks,
        { ...defaults, status },
        '2026-09-21' as never,
        'e1',
      );
      expect(filtered.map((task) => task.id)).toEqual([idByStatus[status]]);
    }
  });

  it('all status includes completed and cancelled tasks', () => {
    const defaults = defaultTaskFilterState(true);
    const tasks = [
      baseTask({ id: 'open', status: 'todo' }),
      baseTask({ id: 'done', status: 'done' }),
      baseTask({ id: 'cancelled', status: 'cancelled' }),
    ];
    const filtered = filterEmployeeTasks(
      tasks,
      { ...defaults, status: 'all' },
      '2026-09-21' as never,
      'e1',
    );
    expect(filtered.map((task) => task.id)).toEqual(['open', 'done', 'cancelled']);
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
