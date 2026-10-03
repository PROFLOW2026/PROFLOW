import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findProjectMember } from '../data/project-team.repository';
import type { ProjectCapability } from '../domain/capabilities';
import { resolveProjectCapabilities } from '../domain/resolve';

/**
 * Canonical internal authorization for the Developer / GC layer.
 *
 * Works identically from the Owner app and the Employee App: both surfaces resolve
 * an `OrgContext` for a `profiles` user, and capabilities are keyed by that user.
 * A capability on project A grants nothing on project B - resolution is always for
 * exactly one project.
 *
 * Existing org-wide permissions are untouched; only `project_team.admin` (Owner by
 * default) lifts the per-project requirement.
 */

export function isOrgProjectAdmin(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.PROJECT_TEAM_ADMIN);
}

export async function loadProjectCapabilities(
  context: OrgContext,
  projectId: string,
): Promise<ReadonlySet<ProjectCapability>> {
  const admin = isOrgProjectAdmin(context);
  const member = admin
    ? null
    : await findProjectMember(context.db, context.organizationId, projectId, context.userId);
  return resolveProjectCapabilities({
    isOrgProjectAdmin: admin,
    member: member ? { status: member.status, capabilities: member.capabilities } : null,
  });
}

export async function hasProjectCapability(
  context: OrgContext,
  projectId: string,
  capability: ProjectCapability,
): Promise<boolean> {
  return (await loadProjectCapabilities(context, projectId)).has(capability);
}

export async function assertProjectCapability(
  context: OrgContext,
  projectId: string,
  capability: ProjectCapability,
): Promise<void> {
  if (!(await hasProjectCapability(context, projectId, capability))) {
    throw new AuthorizationError(`project:${capability}`);
  }
}

export async function assertAnyProjectCapability(
  context: OrgContext,
  projectId: string,
  capabilities: readonly ProjectCapability[],
): Promise<ReadonlySet<ProjectCapability>> {
  const held = await loadProjectCapabilities(context, projectId);
  if (!capabilities.some((capability) => held.has(capability))) {
    throw new AuthorizationError(`project:${capabilities.join('|')}`);
  }
  return held;
}
