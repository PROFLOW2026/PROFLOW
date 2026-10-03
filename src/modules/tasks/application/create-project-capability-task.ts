import { and, eq } from 'drizzle-orm';
import { organizationMemberships, projects } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { findWorkspaceIdsByProject, lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { insertTask, insertTaskActivity, insertTaskAssignee } from '../data/tasks.repository';
import { buildActivityActorFieldsFromContext, buildCreatorFieldsFromContext } from '../domain/actor';
import { generateSortKey } from '../domain/lexorank';
import type { Task, TaskPriority, TaskSource } from '../domain/types';

export interface CreateProjectCapabilityTaskInput {
  readonly projectId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly dueDate?: string | null;
  readonly priority?: TaskPriority;
  readonly source?: TaskSource;
  /** Internal assignee (profiles.id); resolved to the org membership. */
  readonly assigneeUserId?: string | null;
}

/**
 * Creates a project task in the EXISTING task engine for a caller authorized by a project
 * capability (Developer / GC layer, `tasks.manage`) instead of the org-wide `tasks.create`
 * permission. The caller MUST have asserted the capability before calling; RLS mirrors it
 * (policies `tasks_insert_project_capability` and friends, migration 0160).
 */
export async function createProjectCapabilityTask(
  context: OrgContext,
  input: CreateProjectCapabilityTaskInput,
): Promise<Task> {
  const title = input.title.trim();
  if (!title) throw new ValidationError([{ path: 'title', message: 'Title is required' }]);

  let workspaceId = (await findWorkspaceIdsByProject(context.db, input.projectId))[0] ?? null;
  if (!workspaceId) {
    const [project] = await context.db
      .select({ name: projects.name })
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, context.organizationId)))
      .limit(1);
    if (!project) throw new NotFoundError('Project');
    workspaceId = (await lazyCreateProjectWorkspace(context, input.projectId, project.name)).workspace.id;
  }

  const task = await insertTask(context.db, {
    organizationId: context.organizationId,
    workspaceId,
    projectId: input.projectId,
    title,
    description: input.description ?? null,
    priority: input.priority ?? 'medium',
    dueDate: input.dueDate ?? null,
    source: input.source ?? 'automation',
    sortKey: generateSortKey(),
    ...buildCreatorFieldsFromContext(context),
  });

  await insertTaskActivity(context.db, {
    taskId: task.id,
    organizationId: context.organizationId,
    ...buildActivityActorFieldsFromContext(context),
    eventType: 'created',
    payload: { title: task.title },
  });

  if (input.assigneeUserId) {
    const [membership] = await context.db
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, context.organizationId),
          eq(organizationMemberships.userId, input.assigneeUserId),
          eq(organizationMemberships.status, 'active'),
        ),
      )
      .limit(1);
    if (!membership) {
      throw new ValidationError([{ path: 'assignee', message: 'Assignee is not an active organization member' }]);
    }
    await insertTaskAssignee(context.db, {
      taskId: task.id,
      organizationId: context.organizationId,
      orgMemberId: membership.id,
      assignedByOrgMemberId: context.membershipId,
    });
  }

  return task;
}
