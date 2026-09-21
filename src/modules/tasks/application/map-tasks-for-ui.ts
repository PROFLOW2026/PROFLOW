import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { sumReportedHoursForTask } from '@/modules/workforce';
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
import { listTaskAttachments } from './task-attachments';

function mapAttachmentsForUi(
  documents: Awaited<ReturnType<typeof listTaskAttachments>>,
): UiTaskDetail['attachments'] {
  return documents
    .filter((document) => document.status === 'available')
    .map((document) => ({
      id: document.id,
      name: document.originalFilename,
      url: `/api/org-storage/download/${document.id}`,
      size: document.sizeBytes ?? 0,
      linkId: document.linkId ?? null,
    }));
}

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
  const [projectLabels, assigneeMap, reportedHours, attachments] = await Promise.all([
    enrichTasksWithProjectDisplayNames(context, [detail]),
    loadTaskAssigneeDisplayMap(context.db, context.organizationId, [detail.id]),
    sumReportedHoursForTask(context.db, context.organizationId, detail.id),
    hasPermission(context, PERMISSIONS.DOCUMENTS_READ)
      ? listTaskAttachments(context, detail.id).catch(() => [])
      : Promise.resolve([]),
  ]);

  return mapTaskDetailToUi(detail, {
    projectName: projectDisplayNameForTask(detail, projectLabels),
    assignees: [...assigneeDisplaysForTask(detail.id, assigneeMap)],
    checklistTotal: detail.checklistItems.length,
    checklistDone: detail.checklistItems.filter((item) => item.isDone).length,
    reportedHours,
    attachments: mapAttachmentsForUi(attachments),
  });
}
