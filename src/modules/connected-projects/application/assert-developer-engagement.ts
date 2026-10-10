import { and, eq, isNull } from 'drizzle-orm';
import { projects, subcontractAgreements, vendors } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import { NotFoundError } from '@/shared/errors';
import { loadContractorAccessAuthority } from '@/modules/contractor-access/application/manage-contractor-access';
import { AuthorizationError } from '@/shared/errors';

export async function requireConnectionCodeIssueAuthority(
  context: OrgContext,
  projectId: string,
): Promise<void> {
  const authority = await loadContractorAccessAuthority(context, projectId);
  if (!authority.canInvite) {
    throw new AuthorizationError('project:contractor.invite');
  }
  const [project] = await context.db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, context.organizationId)))
    .limit(1);
  if (!project) throw new NotFoundError('Project');
}

export async function assertDeveloperEngagement(
  context: OrgContext,
  input: {
    readonly projectId: string;
    readonly vendorId: string;
    readonly subcontractAgreementId: string;
  },
): Promise<{ readonly vendorName: string }> {
  return asServiceRoleWrite(context.db, async () => {
    const [vendor] = await context.db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(and(eq(vendors.id, input.vendorId), eq(vendors.organizationId, context.organizationId)))
      .limit(1);
    if (!vendor) throw new NotFoundError('Vendor');

    const [agreement] = await context.db
      .select({ id: subcontractAgreements.id })
      .from(subcontractAgreements)
      .where(
        and(
          eq(subcontractAgreements.id, input.subcontractAgreementId),
          eq(subcontractAgreements.organizationId, context.organizationId),
          eq(subcontractAgreements.vendorId, input.vendorId),
          eq(subcontractAgreements.projectId, input.projectId),
          isNull(subcontractAgreements.archivedAt),
        ),
      )
      .limit(1);
    if (!agreement) throw new NotFoundError('Subcontract agreement');

    return { vendorName: vendor.name };
  });
}
