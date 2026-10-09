import type { TaskCardData } from './task-api';

function coerceIsoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? '');
}

/** Ensures RSC → client boundaries receive JSON-serializable task cards. */
export function serializeTaskCardsForClient(tasks: readonly TaskCardData[]): TaskCardData[] {
  return tasks.map((task) => ({
    ...task,
    description: task.description ?? null,
    dueDate: task.dueDate ?? null,
    startDate: task.startDate ?? null,
    projectName: task.projectName ?? null,
    clientName: task.clientName ?? null,
    bucketName: task.bucketName ?? null,
    workspaceName: task.workspaceName ?? null,
    boardName: task.boardName ?? null,
    progressWeight:
      task.progressWeight == null || task.progressWeight === ''
        ? null
        : String(task.progressWeight),
    createdAt: coerceIsoTimestamp(task.createdAt),
    updatedAt: coerceIsoTimestamp(task.updatedAt),
    assignees: task.assignees.map((assignee) => ({
      id: assignee.id,
      displayName: assignee.displayName ?? null,
      avatarUrl: assignee.avatarUrl ?? null,
    })),
    labels: [...task.labels],
  }));
}
