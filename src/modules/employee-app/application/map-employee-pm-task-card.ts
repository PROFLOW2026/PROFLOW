import type { EmployeePmTaskSummary } from './employee-pm-tasks';
import type { TaskAssigneeDisplay, TaskCardData, TaskPriority, TaskStatus } from '@/modules/tasks/ui/_task-api-stub';

/** Maps employee PM task rows to TaskCardData for BoardView / TaskCard. */
export function mapEmployeePmTaskToCardData(
  task: EmployeePmTaskSummary,
  enrichment?: { projectName?: string | null; assignees?: readonly TaskAssigneeDisplay[] },
): TaskCardData {
  const status = task.status as TaskStatus;
  const priority = task.priority as TaskPriority;
  const now = new Date().toISOString();

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status,
    priority,
    bucketId: status,
    bucketName: null,
    sortKey: task.dueDate ?? task.id,
    assignees: enrichment?.assignees ? [...enrichment.assignees] : [],
    dueDate: task.dueDate,
    labels: [],
    checklistTotal: 0,
    checklistDone: 0,
    isBlocked: status === 'blocked',
    approvalRequired: false,
    projectId: task.projectId,
    projectName: enrichment?.projectName ?? null,
    workspaceId: '',
    workspaceName: null,
    boardId: null,
    boardName: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Synthetic status buckets for employee board (no workspace board access required). */
export const EMPLOYEE_STATUS_BOARD_COLUMNS: readonly TaskStatus[] = [
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
];
