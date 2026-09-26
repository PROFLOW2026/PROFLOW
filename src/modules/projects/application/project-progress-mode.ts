import { and, eq, inArray } from 'drizzle-orm';
import { projects, tasks } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  deriveProjectProgress,
  type ProgressTaskInput,
} from '@/modules/tasks/domain/derive-project-progress';
import { findProjectById } from '../data/projects.repository';

export const PROJECT_PROGRESS_SOURCES = ['manual', 'tasks'] as const;
export type ProjectProgressSource = (typeof PROJECT_PROGRESS_SOURCES)[number];

export function parseProjectProgressSource(
  value: string | null | undefined,
): ProjectProgressSource {
  return value === 'tasks' ? 'tasks' : 'manual';
}

export interface DisplayedProjectProgress {
  readonly source: ProjectProgressSource;
  /** Column value. Never replaced by the derived percent. */
  readonly storedPercent: string | null;
  /** What readers show. Manual uses the stored percent. Tasks uses the formula. */
  readonly displayedPercent: number | null;
  readonly contributingCount: number;
  readonly doneCount: number;
}

function storedPercentString(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null;
  return String(value);
}

function manualDisplayedPercent(stored: string | null): number | null {
  if (stored == null) return null;
  const parsed = Number(stored);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
}

/**
 * Manual mode shows the stored percent.
 * Tasks mode shows `deriveProjectProgress` and leaves the stored percent unchanged.
 */
export function displayedProjectProgress(input: {
  readonly progressSource: string | null | undefined;
  readonly storedPercent: string | number | null | undefined;
  readonly tasks: readonly ProgressTaskInput[];
}): DisplayedProjectProgress {
  const source = parseProjectProgressSource(input.progressSource);
  const storedPercent = storedPercentString(input.storedPercent);
  if (source === 'manual') {
    return {
      source,
      storedPercent,
      displayedPercent: manualDisplayedPercent(storedPercent),
      contributingCount: 0,
      doneCount: 0,
    };
  }
  const derived = deriveProjectProgress(input.tasks);
  return {
    source,
    storedPercent,
    displayedPercent: derived.percent,
    contributingCount: derived.contributingCount,
    doneCount: derived.doneCount,
  };
}

/** Schedule / work-package fallback stays in manual mode. Tasks mode replaces it. */
export function schedulePercentForReader(
  source: string | null | undefined,
  schedulePercent: number | null,
  derivedPercent: number | null,
): number | null {
  return parseProjectProgressSource(source) === 'tasks' ? derivedPercent : schedulePercent;
}

export function displayedPercentString(percent: number | null): string | null {
  if (percent == null) return null;
  return String(percent);
}

export interface ProjectProgressView extends DisplayedProjectProgress {
  readonly projectId: string;
}

export async function loadProjectProgressView(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectProgressView | null> {
  const [project] = await db
    .select({
      progressSource: projects.progressSource,
      progressPercent: projects.progressPercent,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);
  if (!project) return null;

  const source = parseProjectProgressSource(project.progressSource);
  const taskRows =
    source === 'tasks' ? await listProgressTasks(db, organizationId, [projectId]) : [];
  const displayed = displayedProjectProgress({
    progressSource: source,
    storedPercent: project.progressPercent,
    tasks: taskRows,
  });
  return { projectId, ...displayed };
}

export async function loadDerivedProgressByProject(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
): Promise<Map<string, number | null>> {
  const uniqueIds = [...new Set(projectIds)];
  const derived = new Map<string, number | null>();
  for (const id of uniqueIds) derived.set(id, null);
  if (uniqueIds.length === 0) return derived;

  const rows = await listProgressTasks(db, organizationId, uniqueIds);
  const byProject = new Map<string, ProgressTaskInput[]>();
  for (const row of rows) {
    const list = byProject.get(row.projectId) ?? [];
    list.push(row);
    byProject.set(row.projectId, list);
  }
  for (const id of uniqueIds) {
    derived.set(id, deriveProjectProgress(byProject.get(id) ?? []).percent);
  }
  return derived;
}

async function listProgressTasks(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
): Promise<Array<ProgressTaskInput & { projectId: string }>> {
  if (projectIds.length === 0) return [];
  const rows = await db
    .select({
      projectId: tasks.projectId,
      status: tasks.status,
      contributesToProgress: tasks.contributesToProgress,
      progressWeight: tasks.progressWeight,
      isArchived: tasks.isArchived,
    })
    .from(tasks)
    .where(
      and(eq(tasks.organizationId, organizationId), inArray(tasks.projectId, [...projectIds])),
    );
  return rows.flatMap((row) => {
    if (!row.projectId) return [];
    return [
      {
        projectId: row.projectId,
        status: row.status,
        contributesToProgress: row.contributesToProgress,
        progressWeight: row.progressWeight,
        isArchived: row.isArchived,
      },
    ];
  });
}

/**
 * Writes `progress_source` only. `progress_percent` is left as stored.
 */
export async function setProjectProgressSource(
  context: OrgContext,
  projectId: string,
  source: ProjectProgressSource,
): Promise<ProjectProgressView> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  if (source !== 'manual' && source !== 'tasks') {
    throw new ValidationError([{ path: 'progressSource', message: 'Invalid progress source' }]);
  }

  const existing = await findProjectById(context.db, context.organizationId, projectId);
  if (!existing) throw new NotFoundError('Project');
  assertSameOrganization(context, existing, 'Project');

  if (existing.progressSource !== source) {
    const [updated] = await context.db
      .update(projects)
      .set({ progressSource: source, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, context.organizationId)))
      .returning({
        progressSource: projects.progressSource,
        progressPercent: projects.progressPercent,
      });
    if (!updated) throw new NotFoundError('Project');

    const { AUDIT_ACTIONS, recordAuditEvent } = await import('@/shared/audit');
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.PROJECT_UPDATED,
      entityType: 'project',
      entityId: projectId,
      before: {
        progressSource: existing.progressSource,
        progressPercent: existing.progressPercent,
      },
      after: {
        progressSource: updated.progressSource,
        progressPercent: updated.progressPercent,
      },
    });
  }

  const view = await loadProjectProgressView(context.db, context.organizationId, projectId);
  if (!view) throw new NotFoundError('Project');
  return view;
}
