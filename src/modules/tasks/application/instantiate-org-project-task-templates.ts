import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { employees } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { asSessionOwnerWrite } from '@/shared/db/service-role-write';
import { isEmployeeAppUser } from '@/modules/employee-app/application/load-employee-app-context';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import {
  findGeneratedTaskForProjectTemplate,
  listActiveOrgProjectTaskTemplates,
} from '../data/org-project-task-templates.repository';
import { insertTask, insertTaskActivity } from '../data/tasks.repository';
import { buildSystemActivityActorFields, buildSystemCreatorFields } from '../domain/actor';
import { generateSortKey } from '../domain/lexorank';
import { ensureDefaultProjectBoard } from './ensure-default-project-board';
import { ensureAssigneeProjectAccess } from './ensure-assignee-project-access';
import { assignTaskAsSystem } from './system-task-actions';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

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

async function instantiateOneTemplate(
  context: OrgContext,
  input: {
    projectId: string;
    projectName: string;
    workspaceId: string;
    boardId: string | null;
    template: Awaited<ReturnType<typeof listActiveOrgProjectTaskTemplates>>[number];
  },
): Promise<void> {
  const existing = await findGeneratedTaskForProjectTemplate(
    context.db,
    context.organizationId,
    input.projectId,
    input.template.id,
  );
  if (existing) return;

  const assigneeEmployeeIds = await resolveValidAssigneeEmployeeIds(
    context,
    input.template.defaultAssigneeEmployeeIds,
  );

  let task;
  try {
    task = await insertTask(context.db, {
      organizationId: context.organizationId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      boardId: input.boardId,
      title: input.template.title,
      description: input.template.description,
      source: 'template',
      sortKey: generateSortKey(),
      generatedFromOrgProjectTaskTemplateId: input.template.id,
      ...buildSystemCreatorFields(),
    });
  } catch (error) {
    if (isUniqueViolation(error)) return;
    throw error;
  }

  const systemActor = buildSystemActivityActorFields();
  await insertTaskActivity(context.db, {
    taskId: task.id,
    organizationId: context.organizationId,
    ...systemActor,
    eventType: 'task_from_template',
    payload: {
      orgProjectTaskTemplateId: input.template.id,
      title: input.template.title,
    },
  });

  for (const assigneeEmployeeId of assigneeEmployeeIds) {
    await ensureAssigneeProjectAccess(
      context,
      input.projectId,
      assigneeEmployeeId,
      'project.task_template.instantiate',
    );
    await assignTaskAsSystem(
      context,
      {
        entityType: 'project',
        entityId: input.projectId,
        title: input.template.title,
        body: '',
        href: null,
        projectId: input.projectId,
      },
      {
        taskId: task.id,
        employeeId: assigneeEmployeeId,
      },
    );
  }
}

/**
 * Creates canonical project tasks from active org project task templates.
 * Idempotent per (project, template). Never throws for invalid assignee.
 */
export async function instantiateOrgProjectTaskTemplates(
  context: OrgContext,
  projectId: string,
  projectName: string,
): Promise<{ createdCount: number }> {
  const templates = await listActiveOrgProjectTaskTemplates(context.db, context.organizationId);
  if (templates.length === 0) return { createdCount: 0 };

  const run = async () => {
    const { workspace } = await lazyCreateProjectWorkspace(context, projectId, projectName);
    const board = await ensureDefaultProjectBoard(context, workspace.id, projectName);
    let createdCount = 0;

    for (const template of templates) {
      const before = await findGeneratedTaskForProjectTemplate(
        context.db,
        context.organizationId,
        projectId,
        template.id,
      );
      await instantiateOneTemplate(context, {
        projectId,
        projectName,
        workspaceId: workspace.id,
        boardId: board?.id ?? null,
        template,
      });
      const after = await findGeneratedTaskForProjectTemplate(
        context.db,
        context.organizationId,
        projectId,
        template.id,
      );
      if (!before && after) createdCount += 1;
    }

    return { createdCount };
  };

  if (isEmployeeAppUser(context)) {
    return asSessionOwnerWrite(context.db, run);
  }

  return run();
}
