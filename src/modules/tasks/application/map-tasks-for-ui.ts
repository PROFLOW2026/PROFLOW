import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { clients, projects } from '@drizzle/schema';
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

/** Read-only project → client name. No client_id column on tasks. */
async function loadProjectClientNameMap(
  context: OrgContext,
  projectIds: readonly (string | null)[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(projectIds.filter((id): id is string => Boolean(id)))];
  if (uniqueIds.length === 0) return new Map();

  const rows = await context.db
    .select({ projectId: projects.id, clientName: clients.name })
    .from(projects)
    .leftJoin(
      clients,
      and(eq(projects.clientId, clients.id), eq(clients.organizationId, context.organizationId)),
    )
    .where(and(eq(projects.organizationId, context.organizationId), inArray(projects.id, uniqueIds)));

  const names = new Map<string, string>();
  for (const row of rows) {
    if (row.clientName) names.set(row.projectId, row.clientName);
  }
  return names;
}

function clientNameForTask(
  projectId: string | null,
  names: ReadonlyMap<string, string>,
): string | null {
  if (!projectId) return null;
  return names.get(projectId) ?? null;
}

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
  const [projectLabels, assigneeMap, clientNames] = await Promise.all([
    enrichTasksWithProjectDisplayNames(context, tasks),
    loadTaskAssigneeDisplayMap(context.db, context.organizationId, taskIds),
    loadProjectClientNameMap(context, tasks.map((task) => task.projectId)),
  ]);

  return tasks.map((task) =>
    mapTaskToCardData(task, {
      projectName: projectDisplayNameForTask(task, projectLabels),
      clientName: clientNameForTask(task.projectId, clientNames),
      assignees: [...assigneeDisplaysForTask(task.id, assigneeMap)],
    }),
  );
}

export async function mapTaskDetailToUiForOrg(
  context: OrgContext,
  detail: TaskDetail,
): Promise<UiTaskDetail> {
  const [projectLabels, assigneeMap, reportedHours, attachments, clientNames] = await Promise.all([
    enrichTasksWithProjectDisplayNames(context, [detail]),
    loadTaskAssigneeDisplayMap(context.db, context.organizationId, [detail.id]),
    sumReportedHoursForTask(context.db, context.organizationId, detail.id),
    hasPermission(context, PERMISSIONS.DOCUMENTS_READ)
      ? listTaskAttachments(context, detail.id).catch(() => [])
      : Promise.resolve([]),
    loadProjectClientNameMap(context, [detail.projectId]),
  ]);

  return mapTaskDetailToUi(detail, {
    projectName: projectDisplayNameForTask(detail, projectLabels),
    clientName: clientNameForTask(detail.projectId, clientNames),
    assignees: [...assigneeDisplaysForTask(detail.id, assigneeMap)],
    checklistTotal: detail.checklistItems.length,
    checklistDone: detail.checklistItems.filter((item) => item.isDone).length,
    reportedHours,
    attachments: mapAttachmentsForUi(attachments),
  });
}
