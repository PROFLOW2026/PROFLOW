import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { z } from 'zod';
import {
  listAllVendorApBillCandidatesRow,
  listAllVendorComplianceCandidatesRow,
  reviewVendorApBillCandidateRow,
  reviewVendorComplianceCandidateRow,
} from '../data/vendor-portal-candidates';
import { portalCandidateMutatesFinancialTruth } from '../domain/safe-vendor-projection';
import type {
  VendorApBillCandidate,
  VendorComplianceUploadCandidate,
} from '../domain/types';

const reviewSchema = z.object({
  candidateId: z.string().uuid(),
  kind: z.enum(['ap_bill', 'compliance']),
  decision: z.enum(['accepted_for_review', 'rejected']),
  reviewNote: z.string().trim().max(500).optional().nullable(),
});

export type ReviewVendorCandidateInput = z.input<typeof reviewSchema>;

/**
 * Operator review of portal candidates. Never posts AP bills, expenses,
 * payments, or compliance artifacts - internal approval gate only.
 */
export async function reviewVendorPortalCandidate(
  context: OrgContext,
  raw: ReviewVendorCandidateInput,
): Promise<VendorApBillCandidate | VendorComplianceUploadCandidate> {
  assertPermission(context, PERMISSIONS.PORTAL_MANAGE);

  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  if (portalCandidateMutatesFinancialTruth()) {
    throw new DomainRuleError(
      'Vendor portal candidates must not mutate financial truth',
      'portal.errors.financialMutationForbidden',
    );
  }

  const input = parsed.data;
  const updated =
    input.kind === 'ap_bill'
      ? await reviewVendorApBillCandidateRow(context, {
          candidateId: input.candidateId,
          decision: input.decision,
          reviewNote: input.reviewNote,
        })
      : await reviewVendorComplianceCandidateRow(context, {
          candidateId: input.candidateId,
          decision: input.decision,
          reviewNote: input.reviewNote,
        });

  if (!updated) throw new NotFoundError('Vendor portal candidate');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PORTAL_VENDOR_CANDIDATE_REVIEWED,
    entityType: 'portal_vendor_candidate',
    entityId: updated.id,
    after: {
      kind: input.kind,
      decision: input.decision,
      mutatesFinancialTruth: false,
    },
  });

  return updated;
}

export async function listVendorPortalCandidatesForOrg(context: OrgContext): Promise<{
  readonly apBillCandidates: VendorApBillCandidate[];
  readonly complianceCandidates: VendorComplianceUploadCandidate[];
}> {
  assertPermission(context, PERMISSIONS.PORTAL_MANAGE);

  return {
    apBillCandidates: await listAllVendorApBillCandidatesRow(context),
    complianceCandidates: await listAllVendorComplianceCandidatesRow(context),
  };
}
