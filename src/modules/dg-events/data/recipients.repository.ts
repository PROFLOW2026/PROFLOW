import { and, asc, eq, gt, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  externalAccessGrants,
  externalPrincipals,
  organizationMemberships,
  organizations,
  projectMemberCapabilities,
  projectMembers,
  projects,
  roleAssignments,
  rolePermissions,
  subcontractAgreements,
  vendors,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ExternalCandidate } from '../domain/recipients';
import type { ContractorTarget } from '../domain/scope';

/**
 * Recipient resolution runs as service role (the consumer is a trusted system actor), so every
 * query restates the authorization rule explicitly: active org membership, active project
 * membership + stored (pre-expanded) capability, active unexpired contractor grant + ext.* scope.
 */

export async function listProjectCapabilityHolders(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly capabilities: readonly string[];
    readonly onlyUserIds?: readonly string[];
    readonly limit: number;
  },
): Promise<string[]> {
  if (input.capabilities.length === 0) return [];
  if (input.onlyUserIds && input.onlyUserIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ userId: projectMembers.userId })
    .from(projectMembers)
    .innerJoin(
      projectMemberCapabilities,
      and(
        eq(projectMemberCapabilities.memberId, projectMembers.id),
        eq(projectMemberCapabilities.organizationId, projectMembers.organizationId),
      ),
    )
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.organizationId, projectMembers.organizationId),
        eq(organizationMemberships.userId, projectMembers.userId),
        eq(organizationMemberships.status, 'active'),
      ),
    )
    .where(
      and(
        eq(projectMembers.organizationId, input.organizationId),
        eq(projectMembers.projectId, input.projectId),
        eq(projectMembers.status, 'active'),
        inArray(projectMemberCapabilities.capability, [...input.capabilities]),
        input.onlyUserIds ? inArray(projectMembers.userId, [...input.onlyUserIds]) : undefined,
      ),
    )
    .orderBy(asc(projectMembers.userId))
    .limit(Math.max(1, input.limit));
  return rows.map((row) => row.userId);
}

export async function listActiveProjectMemberIds(
  db: DbExecutor,
  input: { readonly organizationId: string; readonly projectId: string; readonly userIds: readonly string[] },
): Promise<string[]> {
  if (input.userIds.length === 0) return [];
  const rows = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.organizationId, projectMembers.organizationId),
        eq(organizationMemberships.userId, projectMembers.userId),
        eq(organizationMemberships.status, 'active'),
      ),
    )
    .where(
      and(
        eq(projectMembers.organizationId, input.organizationId),
        eq(projectMembers.projectId, input.projectId),
        eq(projectMembers.status, 'active'),
        inArray(projectMembers.userId, [...input.userIds]),
      ),
    );
  return rows.map((row) => row.userId);
}

/** Active holders of the org-wide `project_team.admin` permission (Owner by default). */
export async function listProjectAdminUserIds(
  db: DbExecutor,
  input: { readonly organizationId: string; readonly onlyUserIds?: readonly string[]; readonly limit: number },
): Promise<string[]> {
  if (input.onlyUserIds && input.onlyUserIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ userId: roleAssignments.userId })
    .from(roleAssignments)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roleAssignments.roleId))
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.id, roleAssignments.membershipId),
        eq(organizationMemberships.organizationId, input.organizationId),
        eq(organizationMemberships.status, 'active'),
      ),
    )
    .where(
      and(
        eq(roleAssignments.organizationId, input.organizationId),
        eq(rolePermissions.permissionKey, PERMISSIONS.PROJECT_TEAM_ADMIN),
        input.onlyUserIds ? inArray(roleAssignments.userId, [...input.onlyUserIds]) : undefined,
      ),
    )
    .orderBy(asc(roleAssignments.userId))
    .limit(Math.max(1, input.limit));
  return rows.map((row) => row.userId).filter((id): id is string => Boolean(id));
}

function scopesAnyOf(capabilities: readonly string[]): SQL {
  return sql`jsonb_exists_any(${externalAccessGrants.scopes}, ARRAY[${sql.join(
    capabilities.map((capability) => sql`${capability}`),
    sql`, `,
  )}]::text[])`;
}

function activeContractorGrant(organizationId: string, capabilities: readonly string[], now: Date): SQL {
  return and(
    eq(externalAccessGrants.organizationId, organizationId),
    eq(externalAccessGrants.portalKind, 'contractor'),
    eq(externalAccessGrants.status, 'active'),
    isNull(externalAccessGrants.revokedAt),
    or(isNull(externalAccessGrants.expiresAt), gt(externalAccessGrants.expiresAt, now)),
    isNull(externalPrincipals.archivedAt),
    scopesAnyOf(capabilities),
  )!;
}

/** Mirror of `app.external_has_scope` for one contractor target (vendor + optional agreement). */
function coversTarget(projectId: string | null, target: ContractorTarget): SQL {
  return and(
    eq(externalAccessGrants.vendorId, target.vendorId),
    projectId
      ? or(isNull(externalAccessGrants.projectId), eq(externalAccessGrants.projectId, projectId))
      : isNull(externalAccessGrants.projectId),
    target.agreementId
      ? or(
          isNull(externalAccessGrants.subcontractAgreementId),
          eq(externalAccessGrants.subcontractAgreementId, target.agreementId),
        )
      : isNull(externalAccessGrants.subcontractAgreementId),
  )!;
}

/** Mirror of `app.external_can_see_project`: project grant, or vendor grant with an agreement there. */
function coversProject(projectId: string): SQL {
  return or(
    eq(externalAccessGrants.projectId, projectId),
    and(
      isNull(externalAccessGrants.projectId),
      sql`exists (
        select 1 from ${subcontractAgreements} a
        where a.organization_id = ${externalAccessGrants.organizationId}
          and a.vendor_id = ${externalAccessGrants.vendorId}
          and a.project_id = ${projectId}
          and a.status <> 'cancelled'
          and a.archived_at is null
          and (${externalAccessGrants.subcontractAgreementId} is null
            or ${externalAccessGrants.subcontractAgreementId} = a.id)
      )`,
    ),
  )!;
}

export async function listCoveredPrincipals(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string | null;
    readonly capabilities: readonly string[];
    readonly targeting:
      | { readonly mode: 'targets'; readonly targets: readonly ContractorTarget[] }
      | { readonly mode: 'project' };
    readonly now: Date;
    readonly limit: number;
  },
): Promise<ExternalCandidate[]> {
  if (input.capabilities.length === 0) return [];
  const base = activeContractorGrant(input.organizationId, input.capabilities, input.now);
  const select = {
    principalId: externalAccessGrants.principalId,
    vendorId: externalAccessGrants.vendorId,
    agreementId: externalAccessGrants.subcontractAgreementId,
  };

  if (input.targeting.mode === 'project') {
    if (!input.projectId) return [];
    const rows = await db
      .select(select)
      .from(externalAccessGrants)
      .innerJoin(externalPrincipals, eq(externalPrincipals.id, externalAccessGrants.principalId))
      .where(and(base, coversProject(input.projectId)))
      .orderBy(asc(externalAccessGrants.principalId))
      .limit(input.limit);
    return rows.flatMap((row) =>
      row.vendorId ? [{ principalId: row.principalId, vendorId: row.vendorId, agreementId: row.agreementId }] : [],
    );
  }

  const result: ExternalCandidate[] = [];
  for (const target of input.targeting.targets) {
    const rows = await db
      .select({ principalId: externalAccessGrants.principalId })
      .from(externalAccessGrants)
      .innerJoin(externalPrincipals, eq(externalPrincipals.id, externalAccessGrants.principalId))
      .where(and(base, coversTarget(input.projectId, target)))
      .orderBy(asc(externalAccessGrants.principalId))
      .limit(input.limit);
    for (const row of rows) {
      result.push({ principalId: row.principalId, vendorId: target.vendorId, agreementId: target.agreementId });
    }
    if (result.length >= input.limit) break;
  }
  return result;
}

export interface CopyContext {
  readonly projectName: string | null;
  readonly vendorName: string | null;
  readonly defaultLocale: string;
}

export async function loadCopyContext(
  db: DbExecutor,
  input: { readonly organizationId: string; readonly projectId: string | null; readonly vendorId: string | null },
): Promise<CopyContext> {
  const [org] = await db
    .select({ defaultLocale: organizations.defaultLocale })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);
  const [project] = input.projectId
    ? await db
        .select({ name: projects.name })
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.organizationId, input.organizationId)))
        .limit(1)
    : [];
  const [vendor] = input.vendorId
    ? await db
        .select({ name: vendors.name })
        .from(vendors)
        .where(and(eq(vendors.id, input.vendorId), eq(vendors.organizationId, input.organizationId)))
        .limit(1)
    : [];
  return {
    projectName: project?.name ?? null,
    vendorName: vendor?.name ?? null,
    defaultLocale: org?.defaultLocale ?? 'he-IL',
  };
}
