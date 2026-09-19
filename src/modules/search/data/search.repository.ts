/**
 * Global Search data layer.
 *
 * Per-entity search functions. All task searches enforce workspace access +
 * project-context access (same rules as My Work) — NEVER return hits from
 * inaccessible workspaces.
 */

import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { projects, tasks, workspaces } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface TaskSearchHit {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly dueDate: string | null;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
}

export interface ProjectSearchHit {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly clientName: string | null;
}

// ─── Task search ──────────────────────────────────────────────────────────────

/**
 * Search tasks by title/description.
 * Strictly filtered by:
 *  - Caller workspace membership (accessibleWorkspaceIds)
 *  - Project-context access (accessibleProjectIds — null means unrestricted)
 *
 * NEVER returns hits from workspaces not in accessibleWorkspaceIds.
 */
export async function searchTasks(
  db: DbExecutor,
  organizationId: string,
  query: string,
  accessibleWorkspaceIds: string[],
  accessibleProjectIds: string[] | null,
  limit = 10,
): Promise<TaskSearchHit[]> {
  if (!query.trim() || accessibleWorkspaceIds.length === 0) return [];

  const term = `%${query.trim()}%`;

  const conditions = [
    eq(tasks.organizationId, organizationId),
    inArray(tasks.workspaceId, accessibleWorkspaceIds),
    isNull(tasks.archivedAt),
    or(ilike(tasks.title, term), ilike(tasks.description, term))!,
  ];

  // Project-context filter: tasks with no project are always visible in accessible workspaces;
  // tasks with a project must be in accessibleProjectIds.
  if (accessibleProjectIds !== null) {
    if (accessibleProjectIds.length === 0) {
      // Only workspace-wide (no-project) tasks visible
      conditions.push(isNull(tasks.projectId));
    } else {
      conditions.push(
        sql`(${tasks.projectId} IS NULL OR ${tasks.projectId} = ANY(${accessibleProjectIds}))`,
      );
    }
  }

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      workspaceId: tasks.workspaceId,
      workspaceName: workspaces.name,
      projectId: tasks.projectId,
      projectName: projects.name,
    })
    .from(tasks)
    .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(...conditions))
    .orderBy(desc(tasks.updatedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueDate,
    workspaceId: r.workspaceId,
    workspaceName: r.workspaceName,
    projectId: r.projectId ?? null,
    projectName: r.projectName ?? null,
  }));
}

/**
 * Search projects by name.
 * Filtered by accessibleProjectIds (null = unrestricted).
 */
export async function searchProjects(
  db: DbExecutor,
  organizationId: string,
  query: string,
  accessibleProjectIds: string[] | null,
  limit = 10,
): Promise<ProjectSearchHit[]> {
  if (!query.trim()) return [];

  const term = `%${query.trim()}%`;

  const conditions = [
    eq(projects.organizationId, organizationId),
    isNull(projects.archivedAt),
    ilike(projects.name, term),
  ];

  if (accessibleProjectIds !== null) {
    if (accessibleProjectIds.length === 0) return [];
    conditions.push(inArray(projects.id, accessibleProjectIds));
  }

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      clientName: sql<string | null>`(
        select c.name from clients c where c.id = ${projects.clientId} limit 1
      )`,
    })
    .from(projects)
    .where(and(...conditions))
    .orderBy(desc(projects.updatedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    clientName: r.clientName,
  }));
}
