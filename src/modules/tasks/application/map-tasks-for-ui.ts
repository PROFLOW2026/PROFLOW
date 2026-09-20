import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import type { Task, TaskDetail } from '../domain/types';
import {
  mapTaskDetailToUi,
  mapTaskToCardData,
  type TaskCardData,
  type TaskDetail as UiTaskDetail,
} from '../ui/_task-api-stub';
import {
  enrichTasksWithProjectDisplayNames,
  projectDisplayNameForTask,
} from './enrich-task-project-labels';
import { assigneeDisplaysForTask, loadTaskAssigneeDisplayMap } from './enrich-task-assignees';

export async function mapTasksToCardDataForOrg(
  context: OrgContext,
  tasks: readonly Task[],
): Promise<TaskCardData[]> {
  if (tasks.length === 0) return [];

  const taskIds = tasks.map((task) => task.id);
  const [projectLabels, assigneeMap] = await Promise.all([
    enrichTasksWithProjectDisplayNames(context, tasks),
    loadTaskAssigneeDisplayMap(context.db, context.organizationId, taskIds),
  ]);

  return tasks.map((task) =>
    mapTaskToCardData(task, {
      projectName: projectDisplayNameForTask(task, projectLabels),
      assignees: [...assigneeDisplaysForTask(task.id, assigneeMap)],
    }),
  );
}

export async function mapTaskDetailToUiForOrg(
  context: OrgContext,
  detail: TaskDetail,
): Promise<UiTaskDetail> {
  const [projectLabels, assigneeMap] = await Promise.all([
    enrichTasksWithProjectDisplayNames(context, [detail]),
    loadTaskAssigneeDisplayMap(context.db, context.organizationId, [detail.id]),
  ]);

  return mapTaskDetailToUi(detail, {
    projectName: projectDisplayNameForTask(detail, projectLabels),
    assignees: [...assigneeDisplaysForTask(detail.id, assigneeMap)],
    checklistTotal: detail.checklistItems.length,
    checklistDone: detail.checklistItems.filter((item) => item.isDone).length,
  });
}
