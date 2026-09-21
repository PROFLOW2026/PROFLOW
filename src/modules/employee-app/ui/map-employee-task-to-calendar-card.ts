import type { TaskCardData } from '@/modules/tasks/ui/_task-api-stub';
import type { EmployeeTaskListItem } from './employee-filter-logic';

/** Map employee PM task rows to TaskCardData for shared calendar/timeline views. */
export function mapEmployeeTaskToCalendarCard(task: EmployeeTaskListItem): TaskCardData {
  return {
    id: task.id,
    title: task.title,
    description: null,
    status: task.status as TaskCardData['status'],
    priority: task.priority as TaskCardData['priority'],
    bucketId: null,
    bucketName: null,
    sortKey: '',
    assignees: task.assigneeLabel
      ? [{ id: task.assigneeEmployeeIds[0] ?? task.id, displayName: task.assigneeLabel, avatarUrl: null }]
      : [],
    startDate: null,
    dueDate: task.dueDate,
    labels: [],
    checklistTotal: 0,
    checklistDone: 0,
    isBlocked: task.status === 'blocked',
    approvalRequired: false,
    projectId: task.projectId,
    projectName: task.projectDisplayName,
    workspaceId: '',
    workspaceName: null,
    boardId: null,
    boardName: null,
    createdAt: '',
    updatedAt: '',
  };
}
