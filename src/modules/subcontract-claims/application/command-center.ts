import type { DgCommandCenterRow } from '@/modules/command-center/domain/dg-items';
import type { DgCommandCenterQueryInput } from '@/modules/command-center/data/dg-ports';
import type { OrgContext } from '@/shared/auth/context';
import { listClaimRows } from '../data/claims.repository';
import { loadAgreementContext } from './claim-engine';
import { listClaimsAwaitingReview } from './internal-claims';
import { loadAgreementPaymentStatus } from './payables';

export async function queryClaimsAwaitingReview(
  context: OrgContext,
  input: DgCommandCenterQueryInput,
): Promise<readonly DgCommandCenterRow[]> {
  const rows: DgCommandCenterRow[] = [];
  for (const projectId of input.projectIds) {
    if (rows.length >= input.limit) break;
    const items = await listClaimsAwaitingReview(context, { projectId, limit: input.limit - rows.length });
    for (const item of items) {
      rows.push({
        id: item.id,
        projectId: item.projectId,
        vendorName: item.vendorName,
        reference: `CLM-${item.claimNumber}`,
        since: item.waitingSince,
      });
    }
  }
  return rows.slice(0, input.limit);
}

export async function queryPaymentEligibilityBlocked(
  context: OrgContext,
  input: DgCommandCenterQueryInput,
): Promise<readonly DgCommandCenterRow[]> {
  const rows: DgCommandCenterRow[] = [];
  for (const projectId of input.projectIds) {
    if (rows.length >= input.limit) break;
    const claims = await listClaimRows(context.db, context.organizationId, {
      projectId,
      statuses: ['certified'],
      limit: 40,
    });
    const seenAgreements = new Set<string>();
    for (const claim of claims) {
      if (rows.length >= input.limit) break;
      if (seenAgreements.has(claim.agreementId)) continue;
      seenAgreements.add(claim.agreementId);
      const agreement = await loadAgreementContext(context.db, context.organizationId, claim.agreementId);
      const status = await loadAgreementPaymentStatus(context.db, {
        organizationId: context.organizationId,
        agreementId: claim.agreementId,
        agreement,
        contractorView: false,
      });
      if (status.eligibility.eligible) continue;
      const reasons = [...new Set(status.eligibility.holds.map((hold) => hold.kind))];
      rows.push({
        id: claim.id,
        projectId,
        claimId: claim.id,
        agreementId: claim.agreementId,
        vendorName: claim.vendorName,
        reference: `CLM-${claim.claimNumber}`,
        reasons,
      });
    }
  }
  return rows.slice(0, input.limit);
}
