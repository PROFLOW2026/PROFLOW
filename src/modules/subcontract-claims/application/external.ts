import { and, eq, inArray } from 'drizzle-orm';
import { subcontractAgreements } from '@drizzle/schema';
import { externalActor } from '@/shared/actor';
import { AUDIT_ACTIONS } from '@/shared/audit';
import { withTransaction } from '@/shared/db';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { ConflictError, NotFoundError } from '@/shared/errors';
import {
  EXTERNAL_CAPABILITIES as X,
  hasExternalScope,
  requireExternalScope,
  type ExternalContext,
  type ExternalScopeTarget,
} from '@/shared/external';
import { assertAgreementClaimable, assertPeriod, assertTransition, isEditableStatus } from '../domain/lifecycle';
import { DEDUCTION_ENTITY, type ClaimListItem } from '../domain/types';
import {
  findClaim,
  findOpenClaimForAgreement,
  insertClaim,
  insertRevision,
  listAssessments,
  listClaimRows,
  lockClaim,
  sumCurrentSubmitted,
  updateClaimRow,
} from '../data/claims.repository';
import { findDeduction, insertDispute, listBasesForClaims, listDeductionRows } from '../data/financial.repository';
import { toDeductionViews } from './deductions';
import {
  createExternalClaimSchema,
  disputeCommentSchema,
  saveClaimDraftSchema,
  type CreateExternalClaimInput,
  type DisputeCommentInput,
  type SaveClaimDraftInput,
} from '../validation/schemas';
import { buildClaimDraftWorkLines, type ClaimDraftWorkLine } from './draft-work-lines';
import { loadAgreementContext, loadClaimState, loadPriorCertified } from './claim-engine';
import { freezeRevision } from './draft-lines';
import { claimEventPayload, openNewRevisionInTx, saveDraftInTx, type InternalClaimDetail } from './internal-claims';
import { loadAgreementPaymentStatus, type AgreementPaymentStatus } from './payables';
import { coveringGrants, parseOrThrow, recordExternalAudit, scopedVendorIds } from './support';
import { toDetailView, toListItems } from './views';

function scopeOf(row: {
  organizationId: string;
  projectId: string;
  vendorId: string;
  agreementId: string;
}): ExternalScopeTarget {
  return {
    organizationId: row.organizationId,
    projectId: row.projectId,
    vendorId: row.vendorId,
    subcontractAgreementId: row.agreementId,
  };
}

function resolveOrganizationForProjectCapability(
  context: ExternalContext,
  projectId: string,
  capability: (typeof X)[keyof typeof X],
): string {
  for (const grant of context.grants) {
    if (
      grant.projectId === projectId &&
      hasExternalScope(
        context,
        {
          organizationId: grant.organizationId,
          projectId,
          vendorId: grant.vendorId,
          subcontractAgreementId: grant.subcontractAgreementId,
        },
        capability,
      )
    ) {
      return grant.organizationId;
    }
  }
  throw new NotFoundError('Project');
}

/** Resolves organization for a project-scoped portal route from the principal's grants. */
export async function resolveContractorClaimsOrganization(
  context: ExternalContext,
  projectId: string,
): Promise<string> {
  return resolveOrganizationForProjectCapability(context, projectId, X.CLAIM_VIEW);
}

export async function resolveContractorPaymentsOrganization(
  context: ExternalContext,
  projectId: string,
): Promise<string> {
  return resolveOrganizationForProjectCapability(context, projectId, X.PAYMENT_VIEW);
}

async function loadExternalClaim(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
  claimId: string,
): Promise<NonNullable<Awaited<ReturnType<typeof findClaim>>>> {
  const claim = await findClaim(context.db, organizationId, claimId);
  if (!claim || claim.projectId !== projectId) throw new NotFoundError('Claim');
  if (claim.status === 'draft' && claim.createdActorType === 'internal') throw new NotFoundError('Claim');
  requireExternalScope(context, scopeOf(claim), X.CLAIM_VIEW);
  return claim;
}

export interface ContractorClaimDetail extends InternalClaimDetail {
  readonly organizationId: string;
  readonly draftWorkLines: readonly ClaimDraftWorkLine[];
}

export async function listContractorProjectClaims(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
): Promise<ClaimListItem[]> {
  const vendorIds = scopedVendorIds(context, organizationId, projectId, [X.CLAIM_VIEW]);
  if (vendorIds.length === 0) throw new NotFoundError('Project');
  const rows = await listClaimRows(context.db, organizationId, { projectId, vendorIds });
  const visible = rows.filter((row) => !(row.status === 'draft' && row.createdActorType === 'internal'));
  const ids = visible.map((row) => row.id);
  const [totals, assessments] = await Promise.all([
    sumCurrentSubmitted(context.db, organizationId, ids),
    listAssessments(context.db, organizationId, ids),
  ]);
  return toListItems(visible, totals, assessments);
}

export async function getContractorClaimDetail(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
  claimId: string,
): Promise<ContractorClaimDetail> {
  const claim = await loadExternalClaim(context, organizationId, projectId, claimId);
  const canSubmit = hasExternalScope(context, scopeOf(claim), X.CLAIM_SUBMIT);
  const state = await loadClaimState(context.db, organizationId, claim);
  const bases = await listBasesForClaims(context.db, organizationId, [claim.id]);
  return {
    organizationId,
    detail: toDetailView(claim, state, bases),
    draftWorkLines: buildClaimDraftWorkLines(state, claim.currency),
    can: {
      edit: canSubmit && isEditableStatus(claim.status),
      review: false,
      certify: false,
      manageDeductions: false,
      viewPayments:
        coveringGrants(
          context,
          { organizationId, projectId, vendorId: claim.vendorId, agreementId: claim.agreementId },
          X.PAYMENT_VIEW,
        ).length > 0,
      managePayments: false,
    },
  };
}

export async function createContractorClaim(
  context: ExternalContext,
  raw: CreateExternalClaimInput,
): Promise<{ claimId: string; claimNumber: number }> {
  const input = parseOrThrow(createExternalClaimSchema.safeParse(raw));
  assertPeriod(input.periodStart, input.periodEnd);
  const agreement = await loadAgreementContext(context.db, input.organizationId, input.agreementId);
  if (agreement.terms.projectId !== input.projectId) throw new NotFoundError('Subcontract agreement');
  requireExternalScope(
    context,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      vendorId: agreement.terms.vendorId,
      subcontractAgreementId: input.agreementId,
    },
    X.CLAIM_SUBMIT,
  );
  assertAgreementClaimable(agreement.terms.agreementStatus);

  return withTransaction(context.db, async (tx) => {
    if (await findOpenClaimForAgreement(tx, input.organizationId, input.agreementId)) {
      throw new ConflictError('Agreement already has an open claim', 'subcontractClaims.errors.openClaimExists');
    }
    const created = await insertClaim(tx, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      vendorId: agreement.terms.vendorId,
      agreementId: input.agreementId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      title: input.title,
      status: 'draft',
      currency: agreement.terms.currency,
      createdActorType: 'external',
      createdByPrincipalId: context.principalId,
    });
    await insertRevision(tx, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      claimId: created.id,
      revisionNo: 1,
      createdActorType: 'external',
      createdByPrincipalId: context.principalId,
    });
    await recordExternalAudit(tx, context, {
      organizationId: input.organizationId,
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_CREATED,
      entityType: 'claim',
      entityId: created.id,
      after: { claimNumber: created.claimNumber, agreementId: input.agreementId, status: 'draft' },
    });
    return { claimId: created.id, claimNumber: created.claimNumber };
  });
}

export async function saveContractorClaimDraft(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
  claimId: string,
  raw: SaveClaimDraftInput,
): Promise<void> {
  const input = parseOrThrow(saveClaimDraftSchema.safeParse(raw));
  const claim = await loadExternalClaim(context, organizationId, projectId, claimId);
  requireExternalScope(context, scopeOf(claim), X.CLAIM_SUBMIT);
  await withTransaction(context.db, async (tx) => {
    const locked = await lockClaim(tx, organizationId, claimId);
    if (!locked) throw new NotFoundError('Claim');
    await saveDraftInTx(tx, locked, input);
    await recordExternalAudit(tx, context, {
      organizationId,
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_UPDATED,
      entityType: 'claim',
      entityId: claimId,
      after: { revisionNo: locked.currentRevisionNo, lineCount: input.lines.length },
    });
  });
}

export async function submitContractorClaim(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
  claimId: string,
): Promise<void> {
  const claim = await loadExternalClaim(context, organizationId, projectId, claimId);
  requireExternalScope(context, scopeOf(claim), X.CLAIM_SUBMIT);
  const actor = externalActor(context.principalId);
  await withTransaction(context.db, async (tx) => {
    const locked = await lockClaim(tx, organizationId, claimId);
    if (!locked) throw new NotFoundError('Claim');
    assertTransition(locked.status, 'submitted', 'external');
    const state = await loadClaimState(tx, organizationId, locked);
    assertAgreementClaimable(state.agreement.terms.agreementStatus);
    await freezeRevision(tx, {
      claim: locked,
      revision: state.activeRevision,
      agreement: state.agreement,
      priorByWorkLine: await loadPriorCertified(tx, organizationId, locked),
      actor,
    });
    await recordExternalAudit(tx, context, {
      organizationId,
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_SUBMITTED,
      entityType: 'claim',
      entityId: claimId,
      after: { revisionNo: locked.currentRevisionNo, status: 'submitted' },
    });
    await emitDomainEvent(tx, {
      organizationId,
      projectId,
      type: DOMAIN_EVENTS.SUBCONTRACT_CLAIM_SUBMITTED,
      entityType: 'claim',
      entityId: claimId,
      actor,
      payload: claimEventPayload(locked, 'submitted', locked.currentRevisionNo),
    });
  });
}

/** Returned claim: contractor opens a new revision (append-only history). */
export async function startContractorClaimCorrection(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
  claimId: string,
): Promise<{ revisionNo: number }> {
  const claim = await loadExternalClaim(context, organizationId, projectId, claimId);
  requireExternalScope(context, scopeOf(claim), X.CLAIM_SUBMIT);
  return withTransaction(context.db, async (tx) => {
    const locked = await lockClaim(tx, organizationId, claimId);
    if (!locked) throw new NotFoundError('Claim');
    const revisionNo = await openNewRevisionInTx(tx, locked, { type: 'external', principalId: context.principalId });
    await recordExternalAudit(tx, context, {
      organizationId,
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_REVISION_OPENED,
      entityType: 'claim',
      entityId: claimId,
      after: { revisionNo },
    });
    return { revisionNo };
  });
}

export async function cancelContractorClaim(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
  claimId: string,
): Promise<void> {
  const claim = await loadExternalClaim(context, organizationId, projectId, claimId);
  requireExternalScope(context, scopeOf(claim), X.CLAIM_SUBMIT);
  await withTransaction(context.db, async (tx) => {
    const locked = await lockClaim(tx, organizationId, claimId);
    if (!locked) throw new NotFoundError('Claim');
    assertTransition(locked.status, 'cancelled', 'external');
    await updateClaimRow(tx, organizationId, locked.id, { status: 'cancelled', cancelledAt: new Date() });
    await recordExternalAudit(tx, context, {
      organizationId,
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_CANCELLED,
      entityType: 'claim',
      entityId: claimId,
      after: { status: 'cancelled' },
    });
  });
}

export async function disputeContractorDeduction(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
  deductionId: string,
  raw: DisputeCommentInput,
): Promise<void> {
  const input = parseOrThrow(disputeCommentSchema.safeParse(raw));
  const target = await findDeduction(context.db, organizationId, deductionId);
  if (!target || target.projectId !== projectId || !target.contractorVisible) throw new NotFoundError('Deduction');
  requireExternalScope(
    context,
    {
      organizationId,
      projectId,
      vendorId: target.vendorId,
      subcontractAgreementId: target.agreementId,
    },
    X.CLAIM_VIEW,
  );
  const actor = externalActor(context.principalId);
  await withTransaction(context.db, async (tx) => {
    await insertDispute(tx, {
      organizationId,
      projectId,
      agreementId: target.agreementId,
      deductionId,
      comment: input.comment,
      actorType: 'external',
      actorPrincipalId: context.principalId,
    });
    await recordExternalAudit(tx, context, {
      organizationId,
      action: AUDIT_ACTIONS.SUBCONTRACT_DEDUCTION_DISPUTED,
      entityType: DEDUCTION_ENTITY,
      entityId: deductionId,
      after: { actor: 'external' },
    });
    await emitDomainEvent(tx, {
      organizationId,
      projectId,
      type: DOMAIN_EVENTS.SUBCONTRACT_DEDUCTION_DISPUTED,
      entityType: DEDUCTION_ENTITY,
      entityId: deductionId,
      actor,
      payload: { deductionId, agreementId: target.agreementId, vendorId: target.vendorId, claimId: target.claimId },
    });
  });
}

export interface ContractorAgreementPayments {
  readonly agreementId: string;
  readonly title: string;
  readonly status: AgreementPaymentStatus;
}

export { listContractorCertifiedReceiptForecast } from './certified-receipt-forecast';

export async function listContractorClaimAgreements(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
): Promise<readonly { id: string; title: string; hasOpenClaim: boolean }[]> {
  const vendorIds = scopedVendorIds(context, organizationId, projectId, [X.CLAIM_SUBMIT]);
  if (vendorIds.length === 0) throw new NotFoundError('Project');
  const rows = await context.db
    .select({ id: subcontractAgreements.id, title: subcontractAgreements.title })
    .from(subcontractAgreements)
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        eq(subcontractAgreements.projectId, projectId),
        inArray(subcontractAgreements.vendorId, [...vendorIds]),
        inArray(subcontractAgreements.status, ['active', 'completed']),
      ),
    )
    .limit(200);
  const open = await listClaimRows(context.db, organizationId, {
    projectId,
    vendorIds,
    statuses: ['draft', 'submitted', 'under_review', 'returned'],
  });
  const openAgreements = new Set(open.map((row) => row.agreementId));
  return rows.map((row) => ({ ...row, hasOpenClaim: openAgreements.has(row.id) }));
}

export async function listContractorProjectDeductions(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
): Promise<Awaited<ReturnType<typeof toDeductionViews>>> {
  const vendorIds = scopedVendorIds(context, organizationId, projectId, [X.CLAIM_VIEW]);
  if (vendorIds.length === 0) throw new NotFoundError('Project');
  const rows = await listDeductionRows(context.db, organizationId, { projectId, vendorIds });
  const visible = rows.filter((row) => row.contractorVisible);
  return toDeductionViews(context.db, organizationId, visible);
}

/** Portal payments tab: one row per granted agreement with ext.payment.view. */
export async function listContractorProjectPayments(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
): Promise<ContractorAgreementPayments[]> {
  const grants = coveringGrants(context, { organizationId, projectId }, X.PAYMENT_VIEW);
  const agreementIds = [...new Set(grants.map((grant) => grant.subcontractAgreementId).filter(Boolean) as string[])];
  if (agreementIds.length === 0) throw new NotFoundError('Project');
  const agreements = await context.db
    .select({
      id: subcontractAgreements.id,
      title: subcontractAgreements.title,
      status: subcontractAgreements.status,
    })
    .from(subcontractAgreements)
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        eq(subcontractAgreements.projectId, projectId),
        inArray(subcontractAgreements.id, agreementIds),
      ),
    );
  const result: ContractorAgreementPayments[] = [];
  for (const agreement of agreements) {
    const ctx = await loadAgreementContext(context.db, organizationId, agreement.id);
    const status = await loadAgreementPaymentStatus(context.db, {
      organizationId,
      agreementId: agreement.id,
      agreement: ctx,
      contractorView: true,
    });
    result.push({ agreementId: agreement.id, title: agreement.title, status });
  }
  return result;
}
