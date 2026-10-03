/**
 * Which projects a viewer may discover in project search.
 * Org project admins keep every accessible project. Everyone else is limited
 * to active memberships whose stored capabilities (plus implication closure)
 * include the capability required to open that row.
 */

import { and, eq } from 'drizzle-orm';
import { projectMemberCapabilities, projectMembers } from '@drizzle/schema';
import { isOrgProjectAdmin } from '@/modules/project-team';
import {
  expandCapabilities,
  PROJECT_CAPABILITIES,
  type ProjectCapability,
} from '@/modules/project-team';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import type { OrgContext } from '@/shared/auth/context';

export interface ProjectSearchAudience {
  readonly admin: boolean;
  /** `null` = unrestricted org project access. */
  readonly accessibleProjectIds: readonly string[] | null;
  /** Absent for org project admins (every capability applies). */
  readonly byProject: ReadonlyMap<string, ReadonlySet<ProjectCapability>> | null;
}

export async function loadProjectSearchAudience(context: OrgContext): Promise<ProjectSearchAudience> {
  const accessibleProjectIds = await resolveAccessibleProjectIds(context);
  if (isOrgProjectAdmin(context)) {
    return { admin: true, accessibleProjectIds, byProject: null };
  }

  const rows = await context.db
    .select({
      projectId: projectMembers.projectId,
      capability: projectMemberCapabilities.capability,
    })
    .from(projectMembers)
    .innerJoin(
      projectMemberCapabilities,
      and(
        eq(projectMemberCapabilities.memberId, projectMembers.id),
        eq(projectMemberCapabilities.organizationId, projectMembers.organizationId),
      ),
    )
    .where(
      and(
        eq(projectMembers.organizationId, context.organizationId),
        eq(projectMembers.userId, context.userId),
        eq(projectMembers.status, 'active'),
      ),
    );

  const raw = new Map<string, string[]>();
  for (const row of rows) {
    const list = raw.get(row.projectId) ?? [];
    list.push(row.capability);
    raw.set(row.projectId, list);
  }

  const accessible = accessibleProjectIds ? new Set(accessibleProjectIds) : null;
  const byProject = new Map<string, ReadonlySet<ProjectCapability>>();
  for (const [projectId, capabilities] of raw) {
    if (accessible && !accessible.has(projectId)) continue;
    byProject.set(projectId, expandCapabilities(capabilities));
  }

  return { admin: false, accessibleProjectIds, byProject };
}

/**
 * Project ids the viewer may open for this capability set.
 * `null` means no project filter (org admin with unrestricted access).
 * An empty array means the kind must not be queried.
 */
export function projectIdsHolding(
  audience: ProjectSearchAudience,
  anyOf: readonly ProjectCapability[],
): readonly string[] | null {
  if (audience.admin) return audience.accessibleProjectIds;
  const ids: string[] = [];
  for (const [projectId, held] of audience.byProject ?? []) {
    if (anyOf.some((capability) => held.has(capability))) ids.push(projectId);
  }
  return ids;
}

const FINANCIAL_VIEW = PROJECT_CAPABILITIES.CONTRACT_FINANCIAL_VIEW;

/** True when this project's contract money may leave the server. */
export function projectAllowsContractMoney(audience: ProjectSearchAudience, projectId: string): boolean {
  if (audience.admin) return true;
  return audience.byProject?.get(projectId)?.has(FINANCIAL_VIEW) ?? false;
}
