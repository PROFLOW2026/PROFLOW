import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  assertPortalCandidateDoesNotMutateFinancialTruth,
  assertVendorGrantActive,
  assertVendorGrantHasScope,
} from '../domain/safe-vendor-projection';
import { findGrantById } from '../data/portal.repository';
import {
  insertVendorComplianceCandidateRow,
  listVendorComplianceCandidatesForVendorRow,
} from '../data/vendor-portal-candidates';
import {
  submitVendorComplianceCandidateSchema,
  type SubmitVendorComplianceCandidateInput,
} from '../validation/schemas';
import type { VendorComplianceUploadCandidate } from '../domain/types';

/**
 * Vendor compliance / insurance upload as CANDIDATE only.
 * Does not write compliance_artifacts as valid truth — internal review first.
 */
export async function submitVendorComplianceCandidate(
  context: OrgContext,
  raw: SubmitVendorComplianceCandidateInput,
): Promise<VendorComplianceUploadCandidate> {
  assertPermission(context, PERMISSIONS.PORTAL_MANAGE);
  assertPortalCandidateDoesNotMutateFinancialTruth();

  const parsed = submitVendorComplianceCandidateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const grant = await findGrantById(context.organizationId, input.grantId);
  if (!grant) throw new NotFoundError('Vendor portal grant');

  assertVendorGrantActive(grant, input.vendorId);
  assertVendorGrantHasScope(grant, 'documents.upload');

  const candidate = await insertVendorComplianceCandidateRow(context, {
    vendorId: input.vendorId,
    grantId: grant.id,
    principalId: grant.principalId,
    artifactKind: input.artifactKind,
    name: input.name,
    referenceNumber: input.referenceNumber ?? null,
    expiresOn: input.expiresOn ?? null,
    notes: input.notes ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'portal');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PORTAL_VENDOR_COMPLIANCE_CANDIDATE,
    entityType: 'vendor_compliance_candidate',
    entityId: candidate.id,
    after: {
      id: candidate.id,
      vendorId: candidate.vendorId,
      grantId: candidate.grantId,
      artifactKind: candidate.artifactKind,
      status: candidate.status,
      mutatesFinancialTruth: false,
      complianceArtifactCreated: false,
    },
  });

  return candidate;
}

export async function listComplianceCandidatesForVendorGrant(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
  vendorId: string,
): Promise<VendorComplianceUploadCandidate[]> {
  return listVendorComplianceCandidatesForVendorRow(context, vendorId);
}
