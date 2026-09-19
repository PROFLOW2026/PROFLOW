import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  workspaces,
  workspaceMembers,
  projectWorkspaceLinks,
  taskBoards,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  Workspace,
  WorkspaceMember,
  ProjectWorkspaceLink,
  WorkspaceDetail,
  WorkspaceMemberAccessLevel,
  WorkspaceType,
  WorkspaceVisibility,
} from '../domain/types';

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapWorkspaceRow(row: typeof workspaces.$inferSelect): Workspace {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    workspaceType: row.workspaceType as WorkspaceType,
    workspaceVisibility: row.workspaceVisibility as WorkspaceVisibility,
    orgTeamId: row.orgTeamId ?? null,
    isArchived: row.isArchived,
    isReadOnly: row.isReadOnly,
    closedAt: row.closedAt ?? null,
    createdByOrgMemberId: row.createdByOrgMemberId ?? null,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWorkspaceMemberRow(row: typeof workspaceMembers.$inferSelect): WorkspaceMember {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    organizationId: row.organizationId,
    orgMemberId: row.orgMemberId ?? null,
    employeeId: row.employeeId ?? null,
    accessLevel: row.accessLevel as WorkspaceMemberAccessLevel,
    addedAt: row.addedAt,
    addedByOrgMemberId: row.addedByOrgMemberId ?? null,
  };
}

function mapProjectWorkspaceLinkRow(
  row: typeof projectWorkspaceLinks.$inferSelect,
): ProjectWorkspaceLink {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    relationshipRole: row.relationshipRole ?? null,
    linkedAt: row.linkedAt,
    linkClosedAt: row.linkClosedAt ?? null,
  };
}

// ─── Workspace CRUD ──────────────────────────────────────────────────────────

export async function insertWorkspace(
  db: DbExecutor,
  input: {
    organizationId: string;
    name: string;
    workspaceType: WorkspaceType;
    workspaceVisibility: WorkspaceVisibility;
    orgTeamId?: string | null;
    createdByOrgMemberId?: string | null;
  },
): Promise<Workspace> {
  const [row] = await db
    .insert(workspaces)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      workspaceType: input.workspaceType,
      workspaceVisibility: input.workspaceVisibility,
      orgTeamId: input.orgTeamId ?? null,
      createdByOrgMemberId: input.createdByOrgMemberId ?? null,
    })
    .returning();
  return mapWorkspaceRow(row!);
}

export async function findWorkspaceById(
  db: DbExecutor,
  organizationId: string,
  workspaceId: string,
): Promise<Workspace | null> {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, organizationId)))
    .limit(1);
  return row ? mapWorkspaceRow(row) : null;
}

export async function updateWorkspaceById(
  db: DbExecutor,
  organizationId: string,
  workspaceId: string,
  patch: Partial<{
    name: string;
    workspaceVisibility: WorkspaceVisibility;
    isReadOnly: boolean;
    isArchived: boolean;
    closedAt: Date | null;
    archivedAt: Date | null;
  }>,
): Promise<Workspace | null> {
  const [row] = await db
    .update(workspaces)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, organizationId)))
    .returning();
  return row ? mapWorkspaceRow(row) : null;
}

export async function listWorkspacesForOrg(
  db: DbExecutor,
  organizationId: string,
  options: {
    includeArchived?: boolean;
    /** When provided, only return workspaces in this set (member-scoped). */
    restrictToIds?: string[] | null;
  } = {},
): Promise<Workspace[]> {
  if (options.restrictToIds !== undefined && options.restrictToIds !== null && options.restrictToIds.length === 0) {
    return [];
  }

  const conditions = [eq(workspaces.organizationId, organizationId)];
  if (!options.includeArchived) {
    conditions.push(eq(workspaces.isArchived, false));
  }
  if (options.restrictToIds && options.restrictToIds.length > 0) {
    conditions.push(inArray(workspaces.id, options.restrictToIds));
  }

  const rows = await db
    .select()
    .from(workspaces)
    .where(and(...conditions))
    .orderBy(workspaces.name);

  return rows.map(mapWorkspaceRow);
}

// ─── Workspace Members ────────────────────────────────────────────────────────

export async function findWorkspaceMember(
  db: DbExecutor,
  workspaceId: string,
  actor: { orgMemberId?: string | null; employeeId?: string | null },
): Promise<WorkspaceMember | null> {
  const conditions = [eq(workspaceMembers.workspaceId, workspaceId)];

  if (actor.orgMemberId) {
    conditions.push(eq(workspaceMembers.orgMemberId, actor.orgMemberId));
  } else if (actor.employeeId) {
    conditions.push(eq(workspaceMembers.employeeId, actor.employeeId));
  } else {
    return null;
  }

  const [row] = await db
    .select()
    .from(workspaceMembers)
    .where(and(...conditions))
    .limit(1);
  return row ? mapWorkspaceMemberRow(row) : null;
}

export async function listWorkspaceMembers(
  db: DbExecutor,
  organizationId: string,
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  const rows = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.organizationId, organizationId),
      ),
    );
  return rows.map(mapWorkspaceMemberRow);
}

export async function insertWorkspaceMember(
  db: DbExecutor,
  input: {
    workspaceId: string;
    organizationId: string;
    orgMemberId?: string | null;
    employeeId?: string | null;
    accessLevel: WorkspaceMemberAccessLevel;
    addedByOrgMemberId?: string | null;
  },
): Promise<WorkspaceMember> {
  const [row] = await db
    .insert(workspaceMembers)
    .values({
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      orgMemberId: input.orgMemberId ?? null,
      employeeId: input.employeeId ?? null,
      accessLevel: input.accessLevel,
      addedByOrgMemberId: input.addedByOrgMemberId ?? null,
    })
    .returning();
  return mapWorkspaceMemberRow(row!);
}

export async function deleteWorkspaceMember(
  db: DbExecutor,
  workspaceMemberId: string,
  organizationId: string,
): Promise<void> {
  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.id, workspaceMemberId),
        eq(workspaceMembers.organizationId, organizationId),
      ),
    );
}

export async function updateWorkspaceMemberAccessLevel(
  db: DbExecutor,
  workspaceMemberId: string,
  organizationId: string,
  accessLevel: WorkspaceMemberAccessLevel,
): Promise<WorkspaceMember | null> {
  const [row] = await db
    .update(workspaceMembers)
    .set({ accessLevel })
    .where(
      and(
        eq(workspaceMembers.id, workspaceMemberId),
        eq(workspaceMembers.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapWorkspaceMemberRow(row) : null;
}

/**
 * Returns all workspace IDs the actor is an explicit member of.
 * Used for building member-scoped workspace lists.
 */
export async function findWorkspaceIdsByActor(
  db: DbExecutor,
  organizationId: string,
  actor: { orgMemberId?: string | null; employeeId?: string | null },
): Promise<string[]> {
  const conditions = [eq(workspaceMembers.organizationId, organizationId)];

  if (actor.orgMemberId) {
    conditions.push(eq(workspaceMembers.orgMemberId, actor.orgMemberId));
  } else if (actor.employeeId) {
    conditions.push(eq(workspaceMembers.employeeId, actor.employeeId));
  } else {
    return [];
  }

  const rows = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(and(...conditions));

  return rows.map((r) => r.workspaceId);
}

// ─── Project ↔ Workspace Links ────────────────────────────────────────────────

export async function findProjectWorkspaceLink(
  db: DbExecutor,
  workspaceId: string,
  projectId: string,
): Promise<ProjectWorkspaceLink | null> {
  const [row] = await db
    .select()
    .from(projectWorkspaceLinks)
    .where(
      and(
        eq(projectWorkspaceLinks.workspaceId, workspaceId),
        eq(projectWorkspaceLinks.projectId, projectId),
      ),
    )
    .limit(1);
  return row ? mapProjectWorkspaceLinkRow(row) : null;
}

export async function listProjectWorkspaceLinksByWorkspace(
  db: DbExecutor,
  workspaceId: string,
): Promise<ProjectWorkspaceLink[]> {
  const rows = await db
    .select()
    .from(projectWorkspaceLinks)
    .where(eq(projectWorkspaceLinks.workspaceId, workspaceId));
  return rows.map(mapProjectWorkspaceLinkRow);
}

export async function listProjectWorkspaceLinksByProject(
  db: DbExecutor,
  projectId: string,
): Promise<ProjectWorkspaceLink[]> {
  const rows = await db
    .select()
    .from(projectWorkspaceLinks)
    .where(eq(projectWorkspaceLinks.projectId, projectId));
  return rows.map(mapProjectWorkspaceLinkRow);
}

export async function insertProjectWorkspaceLink(
  db: DbExecutor,
  input: {
    workspaceId: string;
    projectId: string;
    relationshipRole?: string | null;
  },
): Promise<ProjectWorkspaceLink> {
  const [row] = await db
    .insert(projectWorkspaceLinks)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      relationshipRole: input.relationshipRole ?? null,
    })
    .returning();
  return mapProjectWorkspaceLinkRow(row!);
}

export async function deleteProjectWorkspaceLink(
  db: DbExecutor,
  workspaceId: string,
  projectId: string,
): Promise<void> {
  await db
    .delete(projectWorkspaceLinks)
    .where(
      and(
        eq(projectWorkspaceLinks.workspaceId, workspaceId),
        eq(projectWorkspaceLinks.projectId, projectId),
      ),
    );
}

// ─── Workspace detail (aggregated) ────────────────────────────────────────────

export async function getWorkspaceDetailById(
  db: DbExecutor,
  organizationId: string,
  workspaceId: string,
): Promise<WorkspaceDetail | null> {
  const workspace = await findWorkspaceById(db, organizationId, workspaceId);
  if (!workspace) return null;

  const [memberCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.organizationId, organizationId),
      ),
    );

  const [boardCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(taskBoards)
    .where(
      and(
        eq(taskBoards.workspaceId, workspaceId),
        eq(taskBoards.organizationId, organizationId),
        eq(taskBoards.isArchived, false),
      ),
    );

  const projectLinks = await listProjectWorkspaceLinksByWorkspace(db, workspaceId);

  return {
    ...workspace,
    memberCount: memberCountRow?.count ?? 0,
    boardCount: boardCountRow?.count ?? 0,
    projectLinks,
  };
}

/**
 * Returns workspace IDs that are linked to a specific project.
 */
export async function findWorkspaceIdsByProject(
  db: DbExecutor,
  projectId: string,
): Promise<string[]> {
  const rows = await db
    .select({ workspaceId: projectWorkspaceLinks.workspaceId })
    .from(projectWorkspaceLinks)
    .where(
      and(
        eq(projectWorkspaceLinks.projectId, projectId),
        isNull(projectWorkspaceLinks.linkClosedAt),
      ),
    );
  return rows.map((r) => r.workspaceId);
}
