import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  employees,
  organizationMemberships,
  profiles,
  projectMemberCapabilities,
  projectMembers,
  projects,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { ProjectMemberStatus } from '../domain/resolve';

export interface ProjectMemberRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly title: string | null;
  readonly templateKey: string | null;
  readonly status: ProjectMemberStatus;
  readonly endedAt: Date | null;
  readonly capabilities: readonly string[];
}

export interface ProjectMemberListItem extends ProjectMemberRecord {
  readonly displayName: string | null;
  readonly email: string;
}

function toStatus(value: string): ProjectMemberStatus {
  return value === 'inactive' ? 'inactive' : 'active';
}

export async function findProjectMember(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<ProjectMemberRecord | null> {
  const [row] = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.organizationId, organizationId),
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const capabilities = await listCapabilityKeys(db, organizationId, [row.id]);
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    userId: row.userId,
    title: row.title,
    templateKey: row.templateKey,
    status: toStatus(row.status),
    endedAt: row.endedAt,
    capabilities: capabilities.get(row.id) ?? [],
  };
}

async function listCapabilityKeys(
  db: DbExecutor,
  organizationId: string,
  memberIds: readonly string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (memberIds.length === 0) return result;
  const rows = await db
    .select({
      memberId: projectMemberCapabilities.memberId,
      capability: projectMemberCapabilities.capability,
    })
    .from(projectMemberCapabilities)
    .where(
      and(
        eq(projectMemberCapabilities.organizationId, organizationId),
        inArray(projectMemberCapabilities.memberId, [...memberIds]),
      ),
    );
  for (const row of rows) {
    const bucket = result.get(row.memberId);
    if (bucket) bucket.push(row.capability);
    else result.set(row.memberId, [row.capability]);
  }
  return result;
}

/** One round trip for members + profiles, one for all capabilities (no N+1). */
/** Active members on a project who hold a given capability key (e.g. operational.approve). */
export async function listActiveProjectMemberUserIdsWithCapability(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  capability: string,
): Promise<string[]> {
  const members = await listProjectMembers(db, organizationId, projectId);
  return members
    .filter((member) => member.status === 'active' && member.capabilities.includes(capability))
    .map((member) => member.userId);
}

export async function listProjectMembers(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectMemberListItem[]> {
  const rows = await db
    .select({
      member: projectMembers,
      displayName: profiles.displayName,
      email: profiles.email,
    })
    .from(projectMembers)
    .innerJoin(profiles, eq(profiles.id, projectMembers.userId))
    .where(
      and(eq(projectMembers.organizationId, organizationId), eq(projectMembers.projectId, projectId)),
    )
    .orderBy(asc(projectMembers.createdAt));

  const capabilities = await listCapabilityKeys(
    db,
    organizationId,
    rows.map((row) => row.member.id),
  );

  return rows.map(({ member, displayName, email }) => ({
    id: member.id,
    organizationId: member.organizationId,
    projectId: member.projectId,
    userId: member.userId,
    title: member.title,
    templateKey: member.templateKey,
    status: toStatus(member.status),
    endedAt: member.endedAt,
    capabilities: (capabilities.get(member.id) ?? []).slice().sort(),
    displayName,
    email,
  }));
}

export interface ProjectSummaryRow {
  readonly id: string;
  readonly name: string;
  readonly documentNumber: string | null;
  readonly status: string;
}

export async function findProjectSummary(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectSummaryRow | null> {
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      documentNumber: projects.documentNumber,
      status: projects.status,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export interface MyProjectMembershipRow {
  readonly memberId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectDocumentNumber: string | null;
  readonly projectStatus: string;
  readonly title: string | null;
  readonly templateKey: string | null;
  readonly capabilities: readonly string[];
}

/** Active memberships of one user on non-archived projects (indexed by org + user + status). */
export async function listActiveMembershipsForUser(
  db: DbExecutor,
  organizationId: string,
  userId: string,
): Promise<MyProjectMembershipRow[]> {
  const rows = await db
    .select({
      memberId: projectMembers.id,
      projectId: projectMembers.projectId,
      projectName: projects.name,
      projectDocumentNumber: projects.documentNumber,
      projectStatus: projects.status,
      title: projectMembers.title,
      templateKey: projectMembers.templateKey,
    })
    .from(projectMembers)
    .innerJoin(
      projects,
      and(eq(projects.id, projectMembers.projectId), eq(projects.organizationId, projectMembers.organizationId)),
    )
    .where(
      and(
        eq(projectMembers.organizationId, organizationId),
        eq(projectMembers.userId, userId),
        eq(projectMembers.status, 'active'),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(asc(projects.name));

  const capabilities = await listCapabilityKeys(
    db,
    organizationId,
    rows.map((row) => row.memberId),
  );
  return rows.map((row) => ({
    ...row,
    capabilities: (capabilities.get(row.memberId) ?? []).slice().sort(),
  }));
}

export async function hasActiveMembershipForUser(
  db: DbExecutor,
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.organizationId, organizationId),
        eq(projectMembers.userId, userId),
        eq(projectMembers.status, 'active'),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export interface TeamCandidateRow {
  readonly userId: string;
  readonly displayName: string | null;
  readonly employeeName: string | null;
  readonly jobTitle: string | null;
  readonly email: string;
}

/**
 * Active organization members who are not yet on the project (any status).
 * External principals never hold an organization membership, so they never appear.
 */
export async function listTeamCandidates(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<TeamCandidateRow[]> {
  const existing = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.organizationId, organizationId), eq(projectMembers.projectId, projectId)));
  const taken = new Set(existing.map((row) => row.userId));

  const rows = await db
    .select({
      userId: organizationMemberships.userId,
      displayName: profiles.displayName,
      email: profiles.email,
      employeeName: employees.name,
      jobTitle: employees.jobTitle,
    })
    .from(organizationMemberships)
    .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .leftJoin(
      employees,
      and(
        eq(employees.organizationId, organizationMemberships.organizationId),
        eq(employees.userId, organizationMemberships.userId),
      ),
    )
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, 'active'),
      ),
    )
    .orderBy(asc(profiles.displayName), asc(profiles.email));

  const byUser = new Map<string, TeamCandidateRow>();
  for (const row of rows) {
    if (taken.has(row.userId) || byUser.has(row.userId)) continue;
    byUser.set(row.userId, row);
  }
  return [...byUser.values()];
}

export async function insertProjectMember(
  db: DbExecutor,
  row: {
    organizationId: string;
    projectId: string;
    userId: string;
    title: string | null;
    templateKey: string | null;
    addedByUserId: string;
  },
): Promise<string> {
  const [inserted] = await db
    .insert(projectMembers)
    .values({
      organizationId: row.organizationId,
      projectId: row.projectId,
      userId: row.userId,
      title: row.title,
      templateKey: row.templateKey,
      addedByUserId: row.addedByUserId,
      status: 'active',
    })
    .returning({ id: projectMembers.id });
  return inserted!.id;
}

export async function updateProjectMemberRow(
  db: DbExecutor,
  organizationId: string,
  memberId: string,
  patch: {
    title?: string | null;
    templateKey?: string | null;
    status?: ProjectMemberStatus;
    endedAt?: Date | null;
  },
): Promise<void> {
  await db
    .update(projectMembers)
    .set(patch)
    .where(and(eq(projectMembers.organizationId, organizationId), eq(projectMembers.id, memberId)));
}

/**
 * Replaces the stored capability set with `next` (already expanded). Revokes first,
 * then grants, so the DB no-escalation trigger only evaluates genuinely new grants.
 */
export async function replaceProjectMemberCapabilities(
  db: DbExecutor,
  input: {
    organizationId: string;
    memberId: string;
    current: readonly string[];
    next: readonly string[];
    grantedByUserId: string;
  },
): Promise<{ added: string[]; removed: string[] }> {
  const currentSet = new Set(input.current);
  const nextSet = new Set(input.next);
  const removed = [...currentSet].filter((capability) => !nextSet.has(capability)).sort();
  const added = [...nextSet].filter((capability) => !currentSet.has(capability)).sort();

  if (removed.length > 0) {
    await db
      .delete(projectMemberCapabilities)
      .where(
        and(
          eq(projectMemberCapabilities.organizationId, input.organizationId),
          eq(projectMemberCapabilities.memberId, input.memberId),
          inArray(projectMemberCapabilities.capability, removed),
        ),
      );
  }
  if (added.length > 0) {
    await db.insert(projectMemberCapabilities).values(
      added.map((capability) => ({
        organizationId: input.organizationId,
        memberId: input.memberId,
        capability,
        grantedByUserId: input.grantedByUserId,
      })),
    );
  }
  return { added, removed };
}
