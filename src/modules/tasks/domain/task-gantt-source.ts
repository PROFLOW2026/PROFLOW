import type { PlanningWorkItem } from '@/modules/planning/domain/types';

export interface TaskGanttSourceRow {
  readonly id: string;
  readonly title: string;
  readonly startDate: string | null;
  readonly dueDate: string | null;
  readonly projectId: string | null;
}

/**
 * Maps a task row to a minimal planning work item for {@link buildGanttModel}.
 * Tasks without startDate render as a milestone-style point on the due date.
 */
export function mapTaskCardToGanttWorkItem(
  task: TaskGanttSourceRow,
  sortOrder: number,
): PlanningWorkItem | null {
  const due = task.dueDate;
  const start = task.startDate;
  const marker = due ?? start;
  if (!marker) return null;

  const isPoint = !start && Boolean(due);
  const barStart = start ?? due!;
  const barEnd = due ?? start!;

  const now = new Date();
  return {
    id: task.id,
    organizationId: '',
    projectId: task.projectId ?? '',
    name: task.title,
    kind: isPoint ? 'milestone' : 'task',
    startDate: isPoint ? marker : barStart,
    targetEndDate: isPoint ? marker : barEnd,
    actualEndDate: null,
    progressPercent: 0,
    phaseId: null,
    workPackageId: null,
    taskId: task.id,
    sortOrder,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function mapTaskCardsToGanttWorkItems(
  tasks: readonly TaskGanttSourceRow[],
): PlanningWorkItem[] {
  const items: PlanningWorkItem[] = [];
  tasks.forEach((task, index) => {
    const row = mapTaskCardToGanttWorkItem(task, index);
    if (row) items.push(row);
  });
  return items;
}
