/**
 * Contractor drawing visibility. Internal staff are not decided here.
 *
 * Locked rule: internal is never visible. `ext.plan.view` alone is not enough.
 * `all_contractors` needs that capability and project access (a grant whose project
 * scope covers this project). `distribution` needs a row for this contractor
 * (vendor + agreement, or principal) plus both of those checks.
 * Unknown or empty visibility is denied. This does not consult RLS.
 */
export const CONTRACTOR_PLAN_VIEW = 'ext.plan.view';

export interface ContractorDrawingGrant {
  readonly organizationId: string;
  readonly vendorId: string;
  readonly projectId: string | null;
  readonly subcontractAgreementId: string | null;
  readonly capabilities: ReadonlySet<string>;
  readonly expiresAt?: Date | null;
}

export interface DrawingDistributionFact {
  readonly audience: string | null | undefined;
  readonly vendorId: string | null;
  readonly agreementId: string | null;
  readonly principalId: string | null;
}

export interface ContractorDrawingVisibilityInput {
  readonly visibility: string | null | undefined;
  readonly status: string | null | undefined;
  readonly hasPublishedRevision: boolean;
  readonly organizationId: string;
  readonly projectId: string;
  readonly principalId: string;
  readonly grants: readonly ContractorDrawingGrant[];
  readonly distribution: readonly DrawingDistributionFact[];
  readonly now?: Date;
}

function grantCoversProject(
  grant: ContractorDrawingGrant,
  organizationId: string,
  projectId: string,
  now: Date,
): boolean {
  if (!projectId || grant.organizationId !== organizationId) return false;
  if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) return false;
  if (grant.projectId && grant.projectId !== projectId) return false;
  return true;
}

function grantHasPlanViewOnProject(
  grant: ContractorDrawingGrant,
  organizationId: string,
  projectId: string,
  now: Date,
): boolean {
  return grantCoversProject(grant, organizationId, projectId, now) && grant.capabilities.has(CONTRACTOR_PLAN_VIEW);
}

function distributionRowMatchesContractor(
  row: DrawingDistributionFact,
  principalId: string,
  grants: readonly ContractorDrawingGrant[],
  organizationId: string,
  projectId: string,
  now: Date,
): boolean {
  if (row.audience === 'agreement') {
    if (!row.vendorId || !row.agreementId) return false;
    return grants.some(
      (grant) =>
        grantHasPlanViewOnProject(grant, organizationId, projectId, now) &&
        grant.vendorId === row.vendorId &&
        (grant.subcontractAgreementId == null || grant.subcontractAgreementId === row.agreementId),
    );
  }
  if (row.audience === 'principal') {
    if (!row.principalId || row.principalId !== principalId) return false;
    return grants.some(
      (grant) =>
        grantHasPlanViewOnProject(grant, organizationId, projectId, now) &&
        (row.vendorId == null || grant.vendorId === row.vendorId),
    );
  }
  return false;
}

export function contractorMayViewDrawing(input: ContractorDrawingVisibilityInput): boolean {
  if (input.status !== 'active' || !input.hasPublishedRevision) return false;
  if (input.visibility !== 'all_contractors' && input.visibility !== 'distribution') return false;
  const now = input.now ?? new Date();
  const covering = input.grants.filter((grant) =>
    grantCoversProject(grant, input.organizationId, input.projectId, now),
  );
  const hasProjectAccess = covering.length > 0;
  const hasPlanView = covering.some((grant) => grant.capabilities.has(CONTRACTOR_PLAN_VIEW));
  if (!hasProjectAccess || !hasPlanView) return false;
  if (input.visibility === 'all_contractors') return true;
  return input.distribution.some((row) =>
    distributionRowMatchesContractor(row, input.principalId, input.grants, input.organizationId, input.projectId, now),
  );
}
