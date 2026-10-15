import type { TaskListFilters, TaskPriority, TaskStatus } from '../domain/types';

const STATUS_VALUES = new Set<string>([
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
]);

const PRIORITY_VALUES = new Set<string>(['none', 'low', 'medium', 'high', 'urgent']);

function first(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Maps board page URL search params to repository list filters. */
export function parseBoardTaskListFilters(
  params: Record<string, string | string[] | undefined>,
): TaskListFilters {
  const statusRaw = first(params, 'status');
  const priorityRaw = first(params, 'priority');
  const overdue = first(params, 'overdue') === 'true';
  const blocked = first(params, 'blocked') === 'true';

  return {
    ...(statusRaw && STATUS_VALUES.has(statusRaw)
      ? { status: statusRaw as TaskStatus }
      : {}),
    ...(priorityRaw && PRIORITY_VALUES.has(priorityRaw)
      ? { priority: priorityRaw as TaskPriority }
      : {}),
    ...(first(params, 'assigneeOrgMemberId')
      ? { assigneeOrgMemberId: first(params, 'assigneeOrgMemberId') }
      : {}),
    ...(first(params, 'assigneeEmployeeId')
      ? { assigneeEmployeeId: first(params, 'assigneeEmployeeId') }
      : {}),
    ...(first(params, 'labelId') ? { labelId: first(params, 'labelId') } : {}),
    ...(first(params, 'bucketId') ? { bucketId: first(params, 'bucketId') } : {}),
    ...(first(params, 'dueFrom') ? { dueAfter: first(params, 'dueFrom') } : {}),
    ...(first(params, 'dueTo') ? { dueBefore: first(params, 'dueTo') } : {}),
    ...(first(params, 'search') ? { search: first(params, 'search') } : {}),
    ...(overdue ? { overdue: true } : {}),
    ...(blocked ? { blocked: true } : {}),
  };
}
