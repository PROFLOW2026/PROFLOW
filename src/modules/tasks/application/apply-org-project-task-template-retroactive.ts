import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { employees, taskAssignees } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listOpenTasksGeneratedFromTemplate } from '../data/org-project-task-templates.repository';
import {
  deleteTaskAssignee,
  findTaskAssignee,
  insertTaskActivity,
  insertTaskAssignee,
  updateTaskById,
} from '../data/tasks.repository';
import { buildActivityActorFieldsFromContext } from '../domain/actor';
import { ensureAssigneeProjectAccess } from './ensure-assignee-project-access';

async function resolveValidAssigneeEmployeeIds(
  context: OrgContext,
  employeeIds: readonly string[],
): Promise<string[]> {
  if (employeeIds.length === 0) return [];

  const rows = await context.db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, context.organizationId),
        eq(employees.status, 'active'),
        isNull(employees.archivedAt),
      ),
    );

  const valid = new Set(rows.map((row) => row.id));
  return [...new Set(employeeIds)].filter((id) => valid.has(id));
}

async function syncGeneratedTaskAssignees(
  context: OrgContext,
  taskId: string,
  projectId: string | null,
  desiredEmployeeIds: readonly string[],
): Promise<void> {
  const currentRows = await context.db
    .select()
    .from(taskAssignees)
    .where(
      and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.organizationId, context.organizationId)),
    );

  const actorFields = buildActivityActorFieldsFromContext(context);
  const desiredSet = new Set(desiredEmployeeIds);
  const currentEmployeeIds = currentRows
    .map((row) => row.employeeId)
    .filter((id): id is string => Boolean(id));

  for (const row of currentRows) {
    if (row.employeeId && desiredSet.has(row.employeeId)) continue;
    await deleteTaskAssignee(context.db, taskId, {
      orgMemberId: row.orgMemberId,
      employeeId: row.employeeId,
    });
    await insertTaskActivity(context.db, {
      taskId,
      organizationId: context.organizationId,
      ...actorFields,
      eventType: 'assigned',
      payload: {
        action: 'removed',
        orgMemberId: row.orgMemberId,
        employeeId: row.employeeId,
      },
    });
  }

  for (const employeeId of desiredEmployeeIds) {
    if (currentEmployeeIds.includes(employeeId)) continue;

    const existing = await findTaskAssignee(context.db, taskId, { employeeId });
    if (existing) continue;

    if (projectId) {
      await ensureAssigneeProjectAccess(
        context,
        projectId,
        employeeId,
        'project.task_template.retroactive',
      );
    }

    await insertTaskAssignee(context.db, {
      taskId,
      organizationId: context.organizationId,
      orgMemberId: null,
      employeeId,
      assignedByOrgMemberId: context.membershipId,
    });

    await insertTaskActivity(context.db, {
      taskId,
      organizationId: context.organizationId,
      ...actorFields,
      eventType: 'assigned',
      payload: { orgMemberId: null, employeeId },
    });
  }
}

/**
 * Updates open tasks canonically generated from a template.
 * Manual tasks and terminal tasks are never touched.
 */
export async function applyOrgProjectTaskTemplateRetroactive(
  context: OrgContext,
  templateId: string,
  patch: {
    title: string;
    description: string | null;
    defaultAssigneeEmployeeIds: readonly string[];
  },
): Promise<{ updatedCount: number }> {
  assertPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE);

  const openTasks = await listOpenTasksGeneratedFromTemplate(
    context.db,
    context.organizationId,
    templateId,
  );

  const validAssigneeIds = await resolveValidAssigneeEmployeeIds(
    context,
    patch.defaultAssigneeEmployeeIds,
  );

  let updatedCount = 0;
  for (const task of openTasks) {
    const titleChanged = task.title !== patch.title;
    const descriptionChanged = (task.description ?? null) !== patch.description;

    if (titleChanged || descriptionChanged) {
      await updateTaskById(context.db, context.organizationId, task.id, {
        title: patch.title,
        description: patch.description,
      });
    }

    await syncGeneratedTaskAssignees(context, task.id, task.projectId, validAssigneeIds);
    updatedCount += 1;
  }

  return { updatedCount };
}
