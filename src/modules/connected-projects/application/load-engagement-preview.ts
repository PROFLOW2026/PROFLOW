import { and, eq } from 'drizzle-orm';
import { organizations, projects } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { NotFoundError } from '@/shared/errors';
import { toNumericString } from '@/shared/money';
import { findAgreementOperational } from '@/modules/subcontracts';
import { loadAgreementValuePosition } from '@/modules/subcontracts/application/read-models';
import type { DeveloperEngagementPreview, EngagementConnectionInvitationRow } from '../domain/types';

export async function loadDeveloperEngagementPreview(
  db: DbExecutor,
  invitation: EngagementConnectionInvitationRow,
): Promise<DeveloperEngagementPreview> {
  const [developerOrg] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, invitation.developerOrganizationId))
    .limit(1);
  if (!developerOrg) throw new NotFoundError('Organization');

  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      startDate: projects.startDate,
      targetEndDate: projects.targetEndDate,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, invitation.developerProjectId),
        eq(projects.organizationId, invitation.developerOrganizationId),
      ),
    )
    .limit(1);
  if (!project) throw new NotFoundError('Project');

  const agreement = await findAgreementOperational(
    db,
    invitation.developerOrganizationId,
    invitation.subcontractAgreementId,
  );
  if (!agreement) throw new NotFoundError('Subcontract agreement');

  const value = await loadAgreementValuePosition(
    db,
    invitation.developerOrganizationId,
    invitation.subcontractAgreementId,
  );

  const contractNetAmount = value ? toNumericString(value.current) : null;

  return {
    developerOrganizationId: invitation.developerOrganizationId,
    developerOrganizationName: developerOrg.name,
    developerProjectId: invitation.developerProjectId,
    developerProjectName: project.name,
    subcontractAgreementId: invitation.subcontractAgreementId,
    agreementTitle: agreement.title,
    agreementNumber: agreement.subcontractNumber,
    vendorName: agreement.vendorName ?? '',
    scopeSummary: agreement.scopeSummary,
    currency: value?.currency ?? 'ILS',
    contractNetAmount,
    startDate: agreement.startDate ?? project.startDate,
    targetEndDate: agreement.endDate ?? project.targetEndDate,
    invitationExpiresAt: invitation.expiresAt,
  };
}
