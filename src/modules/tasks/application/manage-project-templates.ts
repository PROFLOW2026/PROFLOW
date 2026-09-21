import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import {
  projectTemplates,
  projectTemplateStages,
  projectTemplateTasks,
} from '@drizzle/schema';
import { and, asc, eq, sql } from 'drizzle-orm';
import { generateSortKey } from '../domain/lexorank';

export interface UwmProjectTemplateSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly orgProfileType: string | null;
  readonly isArchived: boolean;
  readonly stageCount: number;
  readonly taskCount: number;
}

export interface UwmProjectTemplatePreview {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly stages: readonly { readonly id: string; readonly name: string; readonly position: number }[];
  readonly tasks: readonly {
    readonly title: string;
    readonly stageName: string | null;
    readonly dueDateOffsetDays: number | null;
  }[];
}

async function fetchUwmProjectTemplateSummaries(
  context: OrgContext,
  options: { includeArchived?: boolean } = {},
): Promise<UwmProjectTemplateSummary[]> {

  const rows = await context.db
    .select()
    .from(projectTemplates)
    .where(eq(projectTemplates.organizationId, context.organizationId))
    .orderBy(asc(projectTemplates.createdAt));

  const stages = await context.db
    .select({
      templateId: projectTemplateStages.templateId,
      count: sql<number>`count(*)::int`,
    })
    .from(projectTemplateStages)
    .where(eq(projectTemplateStages.organizationId, context.organizationId))
    .groupBy(projectTemplateStages.templateId);

  const tasks = await context.db
    .select({
      templateId: projectTemplateTasks.templateId,
      count: sql<number>`count(*)::int`,
    })
    .from(projectTemplateTasks)
    .where(eq(projectTemplateTasks.organizationId, context.organizationId))
    .groupBy(projectTemplateTasks.templateId);

  const stageCountByTemplate = new Map(stages.map((row) => [row.templateId, row.count]));
  const taskCountByTemplate = new Map(tasks.map((row) => [row.templateId, row.count]));

  return rows
    .filter((row) => options.includeArchived || !row.isArchived)
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      orgProfileType: row.orgProfileType,
      isArchived: row.isArchived,
      stageCount: stageCountByTemplate.get(row.id) ?? 0,
      taskCount: taskCountByTemplate.get(row.id) ?? 0,
    }));
}

export async function listUwmProjectTemplates(
  context: OrgContext,
  options: { includeArchived?: boolean } = {},
): Promise<UwmProjectTemplateSummary[]> {
  assertPermission(context, PERMISSIONS.PROJECT_TEMPLATES_MANAGE);
  return fetchUwmProjectTemplateSummaries(context, options);
}

/** Active UWM templates selectable during project create. */
export async function listLaunchableUwmProjectTemplates(
  context: OrgContext,
): Promise<UwmProjectTemplateSummary[]> {
  assertPermission(context, PERMISSIONS.PROJECTS_CREATE);
  return fetchUwmProjectTemplateSummaries(context, { includeArchived: false });
}

export async function previewUwmProjectTemplate(
  context: OrgContext,
  templateId: string,
): Promise<UwmProjectTemplatePreview> {
  assertPermission(context, PERMISSIONS.PROJECTS_CREATE);

  const [template] = await context.db
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

  if (!template) throw new NotFoundError('ProjectTemplate');

  const stages = await context.db
    .select()
    .from(projectTemplateStages)
    .where(eq(projectTemplateStages.templateId, templateId))
    .orderBy(asc(projectTemplateStages.position));

  const stageNameById = new Map(stages.map((stage) => [stage.id, stage.name]));

  const taskRows = await context.db
    .select()
    .from(projectTemplateTasks)
    .where(eq(projectTemplateTasks.templateId, templateId))
    .orderBy(asc(projectTemplateTasks.sortKey));

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    stages: stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      position: stage.position,
    })),
    tasks: taskRows.map((task) => ({
      title: task.title,
      stageName: task.stageId ? (stageNameById.get(task.stageId) ?? null) : null,
      dueDateOffsetDays: task.dueDateOffsetDays,
    })),
  };
}

export async function duplicateUwmProjectTemplate(
  context: OrgContext,
  templateId: string,
): Promise<{ id: string; name: string }> {
  assertPermission(context, PERMISSIONS.PROJECT_TEMPLATES_MANAGE);

  return withTransaction(context.db, async (tx) => {
    const [source] = await tx
      .select()
      .from(projectTemplates)
      .where(
        and(
          eq(projectTemplates.id, templateId),
          eq(projectTemplates.organizationId, context.organizationId),
        ),
      )
      .limit(1);

    if (!source) throw new NotFoundError('ProjectTemplate');

    const [created] = await tx
      .insert(projectTemplates)
      .values({
        organizationId: context.organizationId,
        name: `${source.name} (copy)`,
        description: source.description,
        orgProfileType: source.orgProfileType,
      })
      .returning({ id: projectTemplates.id, name: projectTemplates.name });

    if (!created) throw new Error('Failed to duplicate project template');

    const stages = await tx
      .select()
      .from(projectTemplateStages)
      .where(eq(projectTemplateStages.templateId, templateId))
      .orderBy(asc(projectTemplateStages.position));

    const stageIdMap = new Map<string, string>();
    if (stages.length > 0) {
      const insertedStages = await tx
        .insert(projectTemplateStages)
        .values(
          stages.map((stage) => ({
            templateId: created.id,
            organizationId: context.organizationId,
            name: stage.name,
            position: stage.position,
            color: stage.color,
          })),
        )
        .returning({ id: projectTemplateStages.id, position: projectTemplateStages.position });

      stages.forEach((stage, index) => {
        const newStage = insertedStages[index];
        if (newStage) stageIdMap.set(stage.id, newStage.id);
      });
    }

    const tasks = await tx
      .select()
      .from(projectTemplateTasks)
      .where(eq(projectTemplateTasks.templateId, templateId))
      .orderBy(asc(projectTemplateTasks.sortKey));

    if (tasks.length > 0) {
      await tx.insert(projectTemplateTasks).values(
        tasks.map((task) => ({
          templateId: created.id,
          organizationId: context.organizationId,
          stageId: task.stageId ? (stageIdMap.get(task.stageId) ?? null) : null,
          title: task.title,
          description: task.description,
          priority: task.priority,
          dueDateOffsetDays: task.dueDateOffsetDays,
          sortKey: task.sortKey ?? generateSortKey(),
        })),
      );
    }

    return created;
  });
}
