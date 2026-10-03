import { and, eq, inArray } from 'drizzle-orm';
import { subcontractAgreements, vendors } from '@drizzle/schema';
import { PROJECT_CAPABILITIES as C, assertProjectCapability, loadProjectCapabilities } from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import { AUDIT_ACTIONS } from '@/shared/audit';
import { internalActor } from '@/shared/actor';
import { withTransaction } from '@/shared/db';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { ConflictError, NotFoundError } from '@/shared/errors';
import {
  assertAgreementClaimable,
  assertPeriod,
  assertTransition,
  isEditableStatus,
} from '../domain/lifecycle';
import { AWAITING_REVIEW_STATUSES, CLAIM_ENTITY, type ClaimDetailView, type ClaimListItem, type SubcontractClaimStatus } from '../domain/types';
import {
  findClaim,
  findOpenClaimForAgreement,
  insertClaim,
  insertRevision,
  listAssessments,
  listAwaitingReviewRows,
  listClaimRows,
  lockClaim,
  sumCurrentSubmitted,
  updateClaimRow,
  updateRevisionRow,
  type ClaimRow,
  type ClaimRowWithNames,
} from '../data/claims.repository';
import { listBasesForClaims } from '../data/financial.repository';
import {
  createClaimSchema,
  saveClaimDraftSchema,
  type CreateClaimInput,
  type SaveClaimDraftInput,
} from '../validation/schemas';
import { loadAgreementContext, loadClaimState, loadPriorCertified } from './claim-engine';
import { freezeRevision, writeDraftLines } from './draft-lines';
import { parseOrThrow, recordInternalAudit } from './support';
import { toDetailView, toListItems } from './views';

/**
 * Internal (Owner app / Employee app) claim use-cases. Authorization is per project capability:
 * claim.view reads, claim.review prepares / submits on behalf / reviews, claim.certify certifies.
 */

export async function loadProjectClaim(
  context: OrgContext,
  projectId: string,
  claimId: string,
): Promise<ClaimRowWithNames> {
  const claim = await findClaim(context.db, context.organizationId, claimId);
  if (!claim || claim.projectId !== projectId) throw new NotFoundError('Claim');
  return claim;
}

async function lockProjectClaim(tx: OrgContext['db'], context: OrgContext, projectId: string, claimId: string): Promise<ClaimRow> {
  const claim = await lockClaim(tx, context.organizationId, claimId);
  if (!claim || claim.projectId !== projectId) throw new NotFoundError('Claim');
  return claim;
}

export function claimEventPayload(claim: Pick<ClaimRow, 'id' | 'claimNumber' | 'agreementId' | 'vendorId'>, status: SubcontractClaimStatus, revisionNo: number) {
  return { claimId: claim.id, claimNumber: claim.claimNumber, agreementId: claim.agreementId, vendorId: claim.vendorId, status, revisionNo };
}

export async function listProjectClaims(
  context: OrgContext,
  projectId: string,
  options: { statuses?: readonly SubcontractClaimStatus[]; agreementId?: string | null } = {},
): Promise<ClaimListItem[]> {
  await assertProjectCapability(context, projectId, C.CLAIM_VIEW);
  const rows = await listClaimRows(context.db, context.organizationId, {
    projectId,
    statuses: options.statuses,
    agreementId: options.agreementId ?? null,
  });
  const ids = rows.map((row) => row.id);
  const [totals, assessments] = await Promise.all([
    sumCurrentSubmitted(context.db, context.organizationId, ids),
    listAssessments(context.db, context.organizationId, ids),
  ]);
  return toListItems(rows, totals, assessments);
}

export interface ClaimableAgreement {
  readonly agreementId: string;
  readonly title: string;
  readonly vendorId: string;
  readonly vendorName: string | null;
  readonly status: string;
  readonly hasOpenClaim: boolean;
}

export async function listClaimableAgreements(context: OrgContext, projectId: string): Promise<ClaimableAgreement[]> {
  await assertProjectCapability(context, projectId, C.CLAIM_REVIEW);
  const rows = await context.db
    .select({
      agreementId: subcontractAgreements.id,
      title: subcontractAgreements.title,
      vendorId: subcontractAgreements.vendorId,
      vendorName: vendors.name,
      status: subcontractAgreements.status,
    })
    .from(subcontractAgreements)
    .leftJoin(
      vendors,
      and(eq(vendors.id, subcontractAgreements.vendorId), eq(vendors.organizationId, subcontractAgreements.organizationId)),
    )
    .where(
      and(
        eq(subcontractAgreements.organizationId, context.organizationId),
        eq(subcontractAgreements.projectId, projectId),
        inArray(subcontractAgreements.status, ['active', 'completed']),
      ),
    )
    .limit(200);
  const open = await listClaimRows(context.db, context.organizationId, {
    projectId,
    statuses: ['draft', 'submitted', 'under_review', 'returned'],
  });
  const openAgreements = new Set(open.map((row) => row.agreementId));
  return rows.map((row) => ({ ...row, hasOpenClaim: openAgreements.has(row.agreementId) }));
}

export interface InternalClaimDetail {
  readonly detail: ClaimDetailView;
  readonly can: {
    readonly edit: boolean;
    readonly review: boolean;
    readonly certify: boolean;
    readonly manageDeductions: boolean;
    readonly viewPayments: boolean;
    readonly managePayments: boolean;
  };
}

export async function getClaimDetail(context: OrgContext, projectId: string, claimId: string): Promise<InternalClaimDetail> {
  const capabilities = await loadProjectCapabilities(context, projectId);
  if (!capabilities.has(C.CLAIM_VIEW)) throw new NotFoundError('Claim');
  const claim = await loadProjectClaim(context, projectId, claimId);
  const state = await loadClaimState(context.db, context.organizationId, claim);
  const bases = await listBasesForClaims(context.db, context.organizationId, [claim.id]);
  const review = capabilities.has(C.CLAIM_REVIEW);
  return {
    detail: toDetailView(claim, state, bases),
    can: {
      edit: review && isEditableStatus(claim.status),
      review,
      certify: capabilities.has(C.CLAIM_CERTIFY),
      manageDeductions: capabilities.has(C.DEDUCTIONS_MANAGE),
      viewPayments: capabilities.has(C.PAYMENT_VIEW),
      managePayments: capabilities.has(C.PAYMENT_MANAGE),
    },
  };
}

export async function createClaim(context: OrgContext, raw: CreateClaimInput): Promise<{ claimId: string; claimNumber: number }> {
  const input = parseOrThrow(createClaimSchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.CLAIM_REVIEW);
  assertPeriod(input.periodStart, input.periodEnd);
  const agreement = await loadAgreementContext(context.db, context.organizationId, input.agreementId);
  if (agreement.terms.projectId !== input.projectId) throw new NotFoundError('Subcontract agreement');
  assertAgreementClaimable(agreement.terms.agreementStatus);

  return withTransaction(context.db, async (tx) => {
    if (await findOpenClaimForAgreement(tx, context.organizationId, input.agreementId)) {
      throw new ConflictError('Agreement already has an open claim', 'subcontractClaims.errors.openClaimExists');
    }
    const created = await insertClaim(tx, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      vendorId: agreement.terms.vendorId,
      agreementId: input.agreementId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      title: input.title,
      status: 'draft',
      currency: agreement.terms.currency,
      createdActorType: 'internal',
      createdByUserId: context.userId,
    });
    await insertRevision(tx, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      claimId: created.id,
      revisionNo: 1,
      createdActorType: 'internal',
      createdByUserId: context.userId,
    });
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_CREATED,
      entityType: CLAIM_ENTITY,
      entityId: created.id,
      after: { claimNumber: created.claimNumber, agreementId: input.agreementId, status: 'draft' },
    });
    return { claimId: created.id, claimNumber: created.claimNumber };
  });
}

/** Saves the draft revision (period, note, lines). Never touches a submitted revision. */
export async function saveClaimDraft(
  context: OrgContext,
  projectId: string,
  claimId: string,
  raw: SaveClaimDraftInput,
): Promise<void> {
  const input = parseOrThrow(saveClaimDraftSchema.safeParse(raw));
  await assertProjectCapability(context, projectId, C.CLAIM_REVIEW);
  await withTransaction(context.db, async (tx) => {
    const claim = await lockProjectClaim(tx, context, projectId, claimId);
    await saveDraftInTx(tx, claim, input);
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_UPDATED,
      entityType: CLAIM_ENTITY,
      entityId: claim.id,
      after: { revisionNo: claim.currentRevisionNo, lineCount: input.lines.length },
    });
  });
}

/** Shared by internal and contractor drafts (authorization happens in the caller). */
export async function saveDraftInTx(
  tx: OrgContext['db'],
  claim: ClaimRow,
  input: ReturnType<typeof saveClaimDraftSchema.parse>,
): Promise<void> {
  if (!isEditableStatus(claim.status)) {
    throw new ConflictError('Only a draft claim can be edited', 'subcontractClaims.errors.notEditable');
  }
  const periodStart = input.periodStart ?? claim.periodStart;
  const periodEnd = input.periodEnd ?? claim.periodEnd;
  assertPeriod(periodStart, periodEnd);
  if (periodStart !== claim.periodStart || periodEnd !== claim.periodEnd || input.title !== claim.title) {
    await updateClaimRow(tx, claim.organizationId, claim.id, { periodStart, periodEnd, title: input.title });
  }
  const state = await loadClaimState(tx, claim.organizationId, claim);
  if (input.note !== state.activeRevision.note) {
    await updateRevisionRow(tx, claim.organizationId, state.activeRevision.id, { note: input.note });
  }
  await writeDraftLines(tx, {
    claim,
    revision: state.activeRevision,
    agreement: state.agreement,
    priorByWorkLine: state.priorByWorkLine,
    lines: input.lines.map((line) => ({
      workLineId: line.workLineId,
      currentAmount: line.currentAmount,
      progressPercent: line.progressPercent ?? null,
      cumulativeQuantity: line.cumulativeQuantity ?? null,
      note: line.note,
    })),
  });
}

/** Submit on behalf of the contractor (e.g. a paper claim entered by the project team). */
export async function submitClaim(context: OrgContext, projectId: string, claimId: string): Promise<void> {
  await assertProjectCapability(context, projectId, C.CLAIM_REVIEW);
  const actor = internalActor(context.userId);
  await withTransaction(context.db, async (tx) => {
    const claim = await lockProjectClaim(tx, context, projectId, claimId);
    assertTransition(claim.status, 'submitted', 'internal');
    const state = await loadClaimState(tx, context.organizationId, claim);
    assertAgreementClaimable(state.agreement.terms.agreementStatus);
    await freezeRevision(tx, {
      claim,
      revision: state.activeRevision,
      agreement: state.agreement,
      priorByWorkLine: await loadPriorCertified(tx, context.organizationId, claim),
      actor,
    });
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_SUBMITTED,
      entityType: CLAIM_ENTITY,
      entityId: claim.id,
      after: { revisionNo: claim.currentRevisionNo, status: 'submitted' },
    });
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId,
      type: DOMAIN_EVENTS.SUBCONTRACT_CLAIM_SUBMITTED,
      entityType: CLAIM_ENTITY,
      entityId: claim.id,
      actor,
      payload: claimEventPayload(claim, 'submitted', claim.currentRevisionNo),
    });
  });
}

/** A returned claim is corrected in a NEW revision; the returned (submitted) revision stays frozen. */
export async function openNewRevisionInTx(
  tx: OrgContext['db'],
  claim: ClaimRow,
  actor: { type: 'internal'; userId: string } | { type: 'external'; principalId: string },
): Promise<number> {
  assertTransition(claim.status, 'draft', actor.type);
  const state = await loadClaimState(tx, claim.organizationId, claim);
  const nextNo = claim.currentRevisionNo + 1;
  const revisionId = await insertRevision(tx, {
    organizationId: claim.organizationId,
    projectId: claim.projectId,
    claimId: claim.id,
    revisionNo: nextNo,
    createdActorType: actor.type,
    createdByUserId: actor.type === 'internal' ? actor.userId : null,
    createdByPrincipalId: actor.type === 'external' ? actor.principalId : null,
  });
  await updateClaimRow(tx, claim.organizationId, claim.id, { status: 'draft', currentRevisionNo: nextNo });
  // Carry the previous claimed values forward as the starting point of the correction.
  const lines = state.lines.filter((line) => line.submission);
  await writeDraftLines(tx, {
    claim: { ...claim, status: 'draft', currentRevisionNo: nextNo },
    revision: { ...state.activeRevision, id: revisionId, revisionNo: nextNo, submittedAt: null },
    agreement: state.agreement,
    priorByWorkLine: state.priorByWorkLine,
    lines: lines.map((line) => ({
      workLineId: line.workLineId,
      currentAmount: line.submission!.currentAmount,
      progressPercent: line.submission!.progressPercent,
      cumulativeQuantity: line.submission!.cumulativeQuantity,
      note: line.submission!.note,
    })),
  });
  return nextNo;
}

export async function reopenReturnedClaim(context: OrgContext, projectId: string, claimId: string): Promise<{ revisionNo: number }> {
  await assertProjectCapability(context, projectId, C.CLAIM_REVIEW);
  return withTransaction(context.db, async (tx) => {
    const claim = await lockProjectClaim(tx, context, projectId, claimId);
    const revisionNo = await openNewRevisionInTx(tx, claim, { type: 'internal', userId: context.userId });
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_REVISION_OPENED,
      entityType: CLAIM_ENTITY,
      entityId: claim.id,
      after: { revisionNo },
    });
    return { revisionNo };
  });
}

export async function cancelClaim(context: OrgContext, projectId: string, claimId: string): Promise<void> {
  await assertProjectCapability(context, projectId, C.CLAIM_REVIEW);
  await withTransaction(context.db, async (tx) => {
    const claim = await lockProjectClaim(tx, context, projectId, claimId);
    assertTransition(claim.status, 'cancelled', 'internal');
    await updateClaimRow(tx, context.organizationId, claim.id, { status: 'cancelled', cancelledAt: new Date() });
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_CANCELLED,
      entityType: CLAIM_ENTITY,
      entityId: claim.id,
      after: { status: 'cancelled' },
    });
  });
}

export interface AwaitingReviewItem extends ClaimListItem {
  readonly waitingSince: string | null;
}

/**
 * Command Center: claims waiting on the team, across the organization, limited to projects where the user
 * holds claim.review. Bounded scan (indexed partial index on submitted / under_review).
 */
export async function listClaimsAwaitingReview(
  context: OrgContext,
  options: { projectId?: string | null; limit?: number } = {},
): Promise<AwaitingReviewItem[]> {
  const limit = Math.min(options.limit ?? 20, 100);
  let rows: ClaimRowWithNames[];
  if (options.projectId) {
    await assertProjectCapability(context, options.projectId, C.CLAIM_REVIEW);
    rows = await listClaimRows(context.db, context.organizationId, {
      projectId: options.projectId,
      statuses: AWAITING_REVIEW_STATUSES,
      limit,
    });
  } else {
    rows = await listAwaitingReviewRows(context.db, context.organizationId, limit * 3);
    const allowed = new Map<string, boolean>();
    for (const projectId of new Set(rows.map((row) => row.projectId))) {
      allowed.set(projectId, (await loadProjectCapabilities(context, projectId)).has(C.CLAIM_REVIEW));
    }
    rows = rows.filter((row) => allowed.get(row.projectId)).slice(0, limit);
  }
  const ids = rows.map((row) => row.id);
  const totals = await sumCurrentSubmitted(context.db, context.organizationId, ids);
  return toListItems(rows, totals, []).map((item) => ({ ...item, waitingSince: item.submittedAt }));
}
