import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { projectTemplates, projectTemplateStages, projectTemplateTasks } from '@drizzle/schema';
import { eq } from 'drizzle-orm';
import { insertTask, insertTaskActivity } from '../data/tasks.repository';
import { insertBoard, insertBucket } from '../data/boards.repository';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { buildCreatorFieldsFromContext, buildActivityActorFieldsFromContext } from '../domain/actor';
import { generateSortKey } from '../domain/lexorank';
import type { Task, TaskBucket, TaskPriority } from '../domain/types';

export interface ApplyProjectTemplateResult {
  readonly workspaceId: string;
  readonly boardId: string;
  readonly stages: Array<{ stageId: string; bucketId: string; name: string }>;
  readonly tasks: Task[];
}

/**
 * Applies a project template to a project:
 * 1. Lazily creates a default workspace + board for the project
 * 2. Creates board buckets for each template stage
 * 3. Creates tasks for each template task
 */
export async function applyProjectTemplate(
  context: OrgContext,
  projectId: string,
  projectName: string,
  templateId: string,
): Promise<ApplyProjectTemplateResult> {
  assertPermission(context, PERMISSIONS.PROJECT_TEMPLATES_MANAGE);

  return withTransaction(context.db, async (tx) => {
    // Fetch template
    const [templateRow] = await tx
      .select()
      .from(projectTemplates)
      .where(eq(projectTemplates.id, templateId))
      .limit(1);

    if (!templateRow || templateRow.organizationId !== context.organizationId) {
      throw new NotFoundError('ProjectTemplate');
    }

    // Lazily create workspace + board
    const { workspace } = await lazyCreateProjectWorkspace(context, projectId, projectName);

    // Create a board named after the template
    const board = await insertBoard(tx, {
      organizationId: context.organizationId,
      workspaceId: workspace.id,
      name: templateRow.name,
      position: 0,
      isDefault: true,
    });

    // Fetch template stages
    const stages = await tx
      .select()
      .from(projectTemplateStages)
      .where(eq(projectTemplateStages.templateId, templateId))
      .orderBy(projectTemplateStages.position);

    // Create buckets for each stage
    const buckets: TaskBucket[] = [];
    const stageResults: ApplyProjectTemplateResult['stages'] = [];

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

    // Build stage → bucket lookup
    const stageToBucket = new Map<string, string>();
    stages.forEach((stage, idx) => {
      const bucket = buckets[idx];
      if (bucket) stageToBucket.set(stage.id, bucket.id);
    });

    // Fetch template tasks
    const templateTaskRows = await tx
      .select()
      .from(projectTemplateTasks)
      .where(eq(projectTemplateTasks.templateId, templateId))
      .orderBy(projectTemplateTasks.sortKey);

    // Create tasks from template
    const creatorFields = buildCreatorFieldsFromContext(context);
    const actorFields = buildActivityActorFieldsFromContext(context);
    const createdTasks: Task[] = [];

    for (const tmplTask of templateTaskRows) {
      const bucketId = tmplTask.stageId ? (stageToBucket.get(tmplTask.stageId) ?? null) : null;
      const sortKey = tmplTask.sortKey ?? generateSortKey();

      const task = await insertTask(tx, {
        organizationId: context.organizationId,
        workspaceId: workspace.id,
        boardId: board.id,
        bucketId,
        projectId,
        title: tmplTask.title,
        description: tmplTask.description ?? null,
        priority: (tmplTask.priority as TaskPriority) ?? 'none',
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
