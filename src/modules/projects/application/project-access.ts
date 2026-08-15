import { and, eq } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { findActiveMembership } from '@/modules/tenancy/data/organizations.repository';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  isProjectAccessMode,
  type ProjectAccessLevel,
  type ProjectAccessMode,
} from '../domain/project-access';
import {
  deleteProjectAccessGrant,
  getStoredProjectAccessMode,
  insertProjectAccessGrant,
  listAccessibleProjectIdsForUser,
  listProjectAccessGrants,
  upsertProjectAccessMode,
  type ProjectAccessGrantRecord,
} from '../data/project-access.repository';

export async function getProjectAccessModeForOrg(context: OrgContext): Promise<ProjectAccessMode> {
  return getStoredProjectAccessMode(context.db, context.organizationId);
}

export async function saveProjectAccessMode(
  context: OrgContext,
  raw: unknown,
): Promise<ProjectAccessMode> {
  assertPermission(context, PERMISSIONS.MEMBERS_MANAGE);
  if (!isProjectAccessMode(raw)) {
    throw new ValidationError([{ path: 'mode', message: 'Invalid project access mode' }]);
  }
  await upsertProjectAccessMode(context.db, context.organizationId, raw);
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_setting',
    entityId: null,
    after: { key: 'project_access_mode', value: raw },
  });
  return raw;
}

export async function listProjectAccessGrantsForOrg(
  context: OrgContext,
  projectId?: string,
): Promise<ProjectAccessGrantRecord[]> {
  assertPermission(context, PERMISSIONS.MEMBERS_READ);
  return listProjectAccessGrants(context.db, context.organizationId, projectId);
}

export async function grantProjectAccess(
  context: OrgContext,
  input: { userId: string; projectId: string; accessLevel?: ProjectAccessLevel },
): Promise<ProjectAccessGrantRecord> {
  assertPermission(context, PERMISSIONS.MEMBERS_MANAGE);

  const [project] = await context.db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, context.organizationId)))
    .limit(1);
  if (!project) throw new NotFoundError('Project');

  const membership = await findActiveMembership(
    context.db,
    context.organizationId,
    input.userId,
  );
  if (!membership) {
    throw new ValidationError([
      { path: 'userId', message: 'Access can only be granted to an active organization member' },
    ]);
  }

  const grant = await insertProjectAccessGrant(context.db, {
    organizationId: context.organizationId,
    userId: input.userId,
    projectId: input.projectId,
    accessLevel: input.accessLevel ?? 'read',
    grantedByUserId: context.userId,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_ACCESS_GRANTED,
    entityType: 'project_access_grant',
    entityId: grant.id,
    after: { userId: input.userId, projectId: input.projectId, accessLevel: grant.accessLevel },
  });
  return grant;
}

export async function revokeProjectAccess(context: OrgContext, grantId: string): Promise<void> {
  assertPermission(context, PERMISSIONS.MEMBERS_MANAGE);
  const ok = await deleteProjectAccessGrant(context.db, context.organizationId, grantId);
  if (!ok) throw new NotFoundError('Project access grant');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_ACCESS_REVOKED,
    entityType: 'project_access_grant',
    entityId: grantId,
    after: { grantId },
  });
}

/**
 * Application-level mirror of `app.can_access_project`.
 * `null` means unrestricted (mode=all or projects.access_all).
 */
export async function resolveAccessibleProjectIds(
  context: OrgContext,
): Promise<string[] | null> {
  if (hasPermission(context, PERMISSIONS.PROJECTS_ACCESS_ALL)) return null;
  const mode = await getStoredProjectAccessMode(context.db, context.organizationId);
  return listAccessibleProjectIdsForUser(context.db, context.organizationId, context.userId, mode);
}

export async function assertCanAccessProject(
  context: OrgContext,
  projectId: string,
): Promise<void> {
  const allowed = await resolveAccessibleProjectIds(context);
  if (allowed === null) return;
  if (!allowed.includes(projectId)) throw new NotFoundError('Project');
}

/** `null` allowed set means unrestricted. Rows with no project stay visible. */
export function isAccessibleProjectId(
  allowed: string[] | null,
  projectId: string | null | undefined,
): boolean {
  if (allowed === null) return true;
  if (!projectId) return true;
  return allowed.includes(projectId);
}
