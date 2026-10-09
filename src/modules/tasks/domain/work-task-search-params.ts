import type { TaskListFilters, TaskPriority, TaskStatus } from './types';
import { compactWorkTaskQuery } from './work-task-filter-keys';

type WritableTaskListFilters = {
  -readonly [Key in keyof TaskListFilters]: TaskListFilters[Key];
};

const STATUS_VALUES: TaskStatus[] = [
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
];

const PRIORITY_VALUES: TaskPriority[] = ['none', 'low', 'medium', 'high', 'urgent'];

function parseBoolFlag(value: string | undefined): boolean | undefined {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return undefined;
}

/** Maps /work lens URL params to server TaskListFilters. */
export function parseWorkTaskListFilters(
  params: Record<string, string | string[] | undefined>,
): TaskListFilters {
  const q = compactWorkTaskQuery(params);
  const filters: WritableTaskListFilters = {};

  if (q.projectId) filters.projectId = q.projectId;
  if (q.clientId) filters.clientId = q.clientId;
  if (q.assigneeOrgMemberId) filters.assigneeOrgMemberId = q.assigneeOrgMemberId;
  if (q.assigneeEmployeeId) filters.assigneeEmployeeId = q.assigneeEmployeeId;
  if (q.labelId) filters.labelId = q.labelId;
  if (q.search) filters.search = q.search;
  if (q.dueFrom) filters.dueAfter = q.dueFrom;
  if (q.dueTo) filters.dueBefore = q.dueTo;

  if (q.status && q.status !== 'all') {
    if (STATUS_VALUES.includes(q.status as TaskStatus)) {
      filters.status = q.status as TaskStatus;
    }
  }

  if (q.priority && PRIORITY_VALUES.includes(q.priority as TaskPriority)) {
    filters.priority = q.priority as TaskPriority;
  }

  const overdue = parseBoolFlag(q.overdue);
  if (overdue === true) filters.overdue = true;

  const blocked = parseBoolFlag(q.blocked);
  if (blocked === true) filters.blocked = true;

  const noProject = parseBoolFlag(q.noProject);
  if (noProject === true) filters.noProjectOnly = true;

  return filters as TaskListFilters;
}
