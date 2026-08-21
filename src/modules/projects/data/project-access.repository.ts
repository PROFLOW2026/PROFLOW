import { and, eq } from 'drizzle-orm';
import {
  employeeProjectAssignments,
  employees,
  organizationSettings,
  projectAccessGrants,
  roleAssignments,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  parseProjectAccessMode,
  PROJECT_ACCESS_SETTING_KEY,
  type ProjectAccessLevel,
  type ProjectAccessMode,
} from '../domain/project-access';

export interface ProjectAccessGrantRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly accessLevel: ProjectAccessLevel;
}

export async function getStoredProjectAccessMode(
  db: DbExecutor,
  organizationId: string,
): Promise<ProjectAccessMode> {
  const [row] = await db
    .select({ value: organizationSettings.value })
    .from(organizationSettings)
    .where(
      and(
        eq(organizationSettings.organizationId, organizationId),
        eq(organizationSettings.key, PROJECT_ACCESS_SETTING_KEY),
      ),
    )
    .limit(1);
  return parseProjectAccessMode(row?.value ?? null);
}

export async function upsertProjectAccessMode(
  db: DbExecutor,
  organizationId: string,
  mode: ProjectAccessMode,
): Promise<void> {
  const [existing] = await db
    .select({ id: organizationSettings.id })
    .from(organizationSettings)
    .where(
      and(
        eq(organizationSettings.organizationId, organizationId),
        eq(organizationSettings.key, PROJECT_ACCESS_SETTING_KEY),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(organizationSettings)
      .set({ value: { mode } })
      .where(eq(organizationSettings.id, existing.id));
    return;
  }

  await db.insert(organizationSettings).values({
    organizationId,
    key: PROJECT_ACCESS_SETTING_KEY,
    value: { mode },
  });
}

export async function listProjectAccessGrants(
  db: DbExecutor,
  organizationId: string,
  projectId?: string,
): Promise<ProjectAccessGrantRecord[]> {
  const rows = await db
    .select()
    .from(projectAccessGrants)
    .where(
      and(
        eq(projectAccessGrants.organizationId, organizationId),
        ...(projectId ? [eq(projectAccessGrants.projectId, projectId)] : []),
      ),
    );
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    projectId: row.projectId,
    accessLevel: row.accessLevel as ProjectAccessLevel,
  }));
}

export async function insertProjectAccessGrant(
  db: DbExecutor,
  input: {
    organizationId: string;
    userId: string;
    projectId: string;
    accessLevel: ProjectAccessLevel;
    grantedByUserId: string;
  },
): Promise<ProjectAccessGrantRecord> {
  const [row] = await db
    .insert(projectAccessGrants)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      projectId: input.projectId,
      accessLevel: input.accessLevel,
      grantedByUserId: input.grantedByUserId,
    })
    .onConflictDoUpdate({
      target: [
        projectAccessGrants.organizationId,
        projectAccessGrants.userId,
        projectAccessGrants.projectId,
      ],
      set: {
        accessLevel: input.accessLevel,
        grantedByUserId: input.grantedByUserId,
      },
    })
    .returning();

  if (!row) throw new Error('Failed to upsert project access grant');
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    projectId: row.projectId,
    accessLevel: row.accessLevel as ProjectAccessLevel,
  };
}

export async function deleteProjectAccessGrant(
  db: DbExecutor,
  organizationId: string,
  grantId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(projectAccessGrants)
    .where(
      and(eq(projectAccessGrants.id, grantId), eq(projectAccessGrants.organizationId, organizationId)),
    )
    .returning({ id: projectAccessGrants.id });
  return deleted.length > 0;
}

export async function listAccessibleProjectIdsForUser(
  db: DbExecutor,
  organizationId: string,
  userId: string,
  mode: ProjectAccessMode,
): Promise<string[] | null> {
  if (mode === 'all') return null;

  const grantRows = await db
    .select({ projectId: projectAccessGrants.projectId })
    .from(projectAccessGrants)
    .where(
      and(eq(projectAccessGrants.organizationId, organizationId), eq(projectAccessGrants.userId, userId)),
    );
  const ids = new Set(grantRows.map((row) => row.projectId));

  if (mode === 'selected') return [...ids];

  const assignmentRows = await db
    .select({ projectId: employeeProjectAssignments.projectId })
    .from(employeeProjectAssignments)
    .innerJoin(
      employees,
      and(
        eq(employees.id, employeeProjectAssignments.employeeId),
        eq(employees.organizationId, employeeProjectAssignments.organizationId),
      ),
    )
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.status, 'active'),
        eq(employees.userId, userId),
      ),
    );
  for (const row of assignmentRows) ids.add(row.projectId);

  const roleRows = await db
    .select({ projectId: roleAssignments.projectId })
    .from(roleAssignments)
    .where(
      and(eq(roleAssignments.organizationId, organizationId), eq(roleAssignments.userId, userId)),
    );
  for (const row of roleRows) {
    if (row.projectId) ids.add(row.projectId);
  }

  return [...ids];
}
