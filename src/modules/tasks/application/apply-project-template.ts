import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { projectTemplates, projectTemplateStages, projectTemplateTasks } from '@drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { offsetBusinessDate } from '@/modules/projects/domain/templates';
import { findProjectById } from '@/modules/projects';
import { insertTask, insertTaskActivity } from '../data/tasks.repository';
import { insertBoard, insertBucket } from '../data/boards.repository';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { buildCreatorFieldsFromContext, buildActivityActorFieldsFromContext } from '../domain/actor';
import { generateSortKey } from '../domain/lexorank';
import type { Task, TaskBucket, TaskPriority } from '../domain/types';

export interface ApplyUwmProjectTemplateResult {
  readonly workspaceId: string;
  readonly boardId: string;
  readonly stages: Array<{ stageId: string; bucketId: string; name: string }>;
  readonly tasks: Task[];
}

/**
 * Applies a UWM project template (DB-backed stages + tasks) to a project:
 * 1. Lazily creates a default workspace + board for the project
 * 2. Creates board buckets for each template stage
 * 3. Creates tasks for each template task (with relative due dates when configured)
 */
export async function applyUwmProjectTemplate(
  context: OrgContext,
  projectId: string,
  projectName: string,
  templateId: string,
  options?: { duringLaunch?: boolean },
): Promise<ApplyUwmProjectTemplateResult> {
  if (options?.duringLaunch) {
    assertPermission(context, PERMISSIONS.PROJECTS_CREATE);
  } else {
    assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  }

  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');

  return withTransaction(context.db, async (tx) => {
    const [templateRow] = await tx
      .select()
      .from(projectTemplates)
      .where(
        and(
          eq(projectTemplates.id, templateId),
          eq(projectTemplates.organizationId, context.organizationId),
          eq(projectTemplates.isArchived, false),
        ),
      )
      .limit(1);

    if (!templateRow) {
      throw new NotFoundError('ProjectTemplate');
    }

    const { workspace } = await lazyCreateProjectWorkspace(context, projectId, projectName);

    const board = await insertBoard(tx, {
      organizationId: context.organizationId,
      workspaceId: workspace.id,
      name: templateRow.name,
      position: 0,
      isDefault: true,
    });

    const stages = await tx
      .select()
      .from(projectTemplateStages)
      .where(eq(projectTemplateStages.templateId, templateId))
      .orderBy(projectTemplateStages.position);

    const buckets: TaskBucket[] = [];
    const stageResults: ApplyUwmProjectTemplateResult['stages'] = [];

    for (const stage of stages) {
      const sortKey = generateSortKey();
      const bucket = await insertBucket(tx, {
        organizationId: context.organizationId,
        boardId: board.id,
        name: stage.name,
        sortKey,
        color: stage.color ?? null,
      });
      buckets.push(bucket);
      stageResults.push({ stageId: stage.id, bucketId: bucket.id, name: stage.name });
    }

    const stageToBucket = new Map<string, string>();
    stages.forEach((stage, idx) => {
      const bucket = buckets[idx];
      if (bucket) stageToBucket.set(stage.id, bucket.id);
    });

    const templateTaskRows = await tx
      .select()
      .from(projectTemplateTasks)
      .where(eq(projectTemplateTasks.templateId, templateId))
      .orderBy(projectTemplateTasks.sortKey);

    const creatorFields = buildCreatorFieldsFromContext(context);
    const actorFields = buildActivityActorFieldsFromContext(context);
    const createdTasks: Task[] = [];

    for (const tmplTask of templateTaskRows) {
      const bucketId = tmplTask.stageId ? (stageToBucket.get(tmplTask.stageId) ?? null) : null;
      const sortKey = tmplTask.sortKey ?? generateSortKey();
      const dueDate = offsetBusinessDate(project.startDate, tmplTask.dueDateOffsetDays);

      const task = await insertTask(tx, {
        organizationId: context.organizationId,
        workspaceId: workspace.id,
        boardId: board.id,
        bucketId,
        projectId,
        title: tmplTask.title,
        description: tmplTask.description ?? null,
        priority: (tmplTask.priority as TaskPriority) ?? 'none',
        dueDate,
        source: 'template',
        sortKey,
        ...creatorFields,
      });

      await insertTaskActivity(tx, {
        taskId: task.id,
        organizationId: context.organizationId,
        ...actorFields,
        eventType: 'created',
        payload: { fromTemplate: templateId, title: task.title },
      });

      createdTasks.push(task);
    }

    return {
      workspaceId: workspace.id,
      boardId: board.id,
      stages: stageResults,
      tasks: createdTasks,
    };
  });
}
