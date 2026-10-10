import { createDraftApBill } from '@/modules/ap';
import { PROJECT_CAPABILITIES as C, assertProjectCapability } from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import { AUDIT_ACTIONS } from '@/shared/audit';
import { internalActor } from '@/shared/actor';
import { withTransaction } from '@/shared/db';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { compareMoney, isPositiveMoney, isZeroMoney, money, subtractMoney, sumMoney } from '@/shared/money';
import { assertCompleteLineSet, requireReason } from '../domain/assessments';
import { assertCertified, assertReviewable, assertTransition } from '../domain/lifecycle';
import { assertCertifiedNotAboveSubmitted, assertWithinCeiling } from '../domain/line-math';
import { CLAIM_ENTITY, type ClaimAssessmentDecision } from '../domain/types';
import { insertAssessments, lockClaim, updateClaimRow, type ClaimRow } from '../data/claims.repository';
import { findBasis, insertBasis, moveBasisApStatus } from '../data/financial.repository';
import {
  certifyClaimSchema,
  reassessClaimSchema,
  reasonSchema,
  requestEvidenceSchema,
  type CertifyClaimInput,
  type ReassessClaimInput,
  type ReasonInput,
  type RequestEvidenceInput,
} from '../validation/schemas';
import { loadClaimState, type ClaimState } from './claim-engine';
import { claimEventPayload } from './internal-claims';
import { computeNextBasis } from './payables';
import {
  deliverClaimCashProjectionUpsert,
  deliverClaimCashProjectionVoid,
  enqueueClaimCashProjectionSync,
  enqueueClaimCashProjectionVoidSync,
} from '@/modules/connected-projects/application/sync-claim-cash-projection';
import { getAdminDb } from '@/shared/db/client';
import { parseOrThrow, recordInternalAudit } from './support';

/**
 * Review decisions. Every decision is an appended assessment row (DB trigger denies UPDATE / DELETE);
 * certification and reassessment append a payable basis. Nothing here writes AP actuals or payments.
 */

async function lockForReview(tx: OrgContext['db'], context: OrgContext, projectId: string, claimId: string): Promise<ClaimRow> {
  const claim = await lockClaim(tx, context.organizationId, claimId);
  if (!claim || claim.projectId !== projectId) throw new NotFoundError('Claim');
  return claim;
}

export async function startClaimReview(context: OrgContext, projectId: string, claimId: string): Promise<void> {
  await assertProjectCapability(context, projectId, C.CLAIM_REVIEW);
  await withTransaction(context.db, async (tx) => {
    const claim = await lockForReview(tx, context, projectId, claimId);
    assertTransition(claim.status, 'under_review', 'internal');
    await updateClaimRow(tx, context.organizationId, claim.id, { status: 'under_review', reviewStartedAt: new Date() });
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_REVIEW_STARTED,
      entityType: CLAIM_ENTITY,
      entityId: claim.id,
      after: { status: 'under_review' },
    });
  });
}

async function deliverCertifiedCashProjectionUpsert(input: {
  readonly developerOrganizationId: string;
  readonly subcontractAgreementId: string;
  readonly payableBasisId: string;
}): Promise<void> {
  try {
    await deliverClaimCashProjectionUpsert(getAdminDb(), input);
  } catch (error) {
    console.error('[subcontract-claims] claim cash projection delivery failed', error);
  }
}

async function deliverCertifiedCashProjectionVoid(input: {
  readonly developerOrganizationId: string;
  readonly subcontractAgreementId: string;
  readonly claimId: string;
}): Promise<void> {
  try {
    await deliverClaimCashProjectionVoid(getAdminDb(), input);
  } catch (error) {
    console.error('[subcontract-claims] claim cash projection void delivery failed', error);
  }
}

export async function returnClaim(context: OrgContext, projectId: string, claimId: string, raw: ReasonInput): Promise<void> {
  const input = parseOrThrow(reasonSchema.safeParse(raw));
  await assertProjectCapability(context, projectId, C.CLAIM_REVIEW);
  const actor = internalActor(context.userId);
  let voidDelivery: {
    readonly developerOrganizationId: string;
    readonly subcontractAgreementId: string;
    readonly claimId: string;
  } | null = null;
  await withTransaction(context.db, async (tx) => {
    const claim = await lockForReview(tx, context, projectId, claimId);
    assertTransition(claim.status, 'returned', 'internal');
    const state = await loadClaimState(tx, context.organizationId, claim);
    await insertAssessments(tx, [
      {
        organizationId: context.organizationId,
        projectId,
        claimId: claim.id,
        revisionId: state.activeRevision.id,
        decision: 'return',
        currency: claim.currency,
        reason: requireReason(input.reason, 'subcontractClaims.errors.reasonRequired'),
        assessorUserId: context.userId,
      },
    ]);
    await updateClaimRow(tx, context.organizationId, claim.id, { status: 'returned', returnedAt: new Date() });
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_RETURNED,
      entityType: CLAIM_ENTITY,
      entityId: claim.id,
      after: { status: 'returned', revisionNo: claim.currentRevisionNo },
    });
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId,
      type: DOMAIN_EVENTS.SUBCONTRACT_CLAIM_RETURNED,
      entityType: CLAIM_ENTITY,
      entityId: claim.id,
      actor,
      payload: claimEventPayload(claim, 'returned', claim.currentRevisionNo),
    });
    await enqueueClaimCashProjectionVoidSync(tx, {
      developerOrganizationId: context.organizationId,
      subcontractAgreementId: claim.agreementId,
      claimId: claim.id,
      sourceVersion: claim.currentRevisionNo,
    });
    voidDelivery = {
      developerOrganizationId: context.organizationId,
      subcontractAgreementId: claim.agreementId,
      claimId: claim.id,
    };
  });
  if (voidDelivery) await deliverCertifiedCashProjectionVoid(voidDelivery);
}

export async function requestClaimEvidence(
  context: OrgContext,
  projectId: string,
  claimId: string,
  raw: RequestEvidenceInput,
): Promise<void> {
  const input = parseOrThrow(requestEvidenceSchema.safeParse(raw));
  await assertProjectCapability(context, projectId, C.CLAIM_REVIEW);
  const actor = internalActor(context.userId);
  await withTransaction(context.db, async (tx) => {
    const claim = await lockForReview(tx, context, projectId, claimId);
    assertReviewable(claim.status);
    const state = await loadClaimState(tx, context.organizationId, claim);
    if (input.claimLineId && !state.lines.some((line) => line.claimLineId === input.claimLineId)) {
      throw new NotFoundError('Claim line');
    }
    await insertAssessments(tx, [
      {
        organizationId: context.organizationId,
        projectId,
        claimId: claim.id,
        revisionId: state.activeRevision.id,
        claimLineId: input.claimLineId ?? null,
        decision: 'request_evidence',
        currency: claim.currency,
        reason: input.reason,
        assessorUserId: context.userId,
      },
    ]);
    if (claim.status === 'submitted') {
      await updateClaimRow(tx, context.organizationId, claim.id, { status: 'under_review', reviewStartedAt: new Date() });
    }
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_EVIDENCE_REQUESTED,
      entityType: CLAIM_ENTITY,
      entityId: claim.id,
      after: { claimLineId: input.claimLineId ?? null },
    });
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId,
      type: DOMAIN_EVENTS.SUBCONTRACT_CLAIM_EVIDENCE_REQUESTED,
      entityType: CLAIM_ENTITY,
      entityId: claim.id,
      actor,
      payload: { ...claimEventPayload(claim, 'under_review', claim.currentRevisionNo), claimLineId: input.claimLineId ?? null },
    });
  });
}

function lineLabel(state: ClaimState, claimLineId: string): string {
  const line = state.lines.find((row) => row.claimLineId === claimLineId);
  return line?.basis?.code ?? line?.basis?.description ?? claimLineId;
}

/** Validates one line decision against the submitted value and the revised-value ceiling. */
function validateLineDecision(state: ClaimState, claimLineId: string, certifiedAmount: string, currency: string) {
  const line = state.lines.find((row) => row.claimLineId === claimLineId);
  if (!line) throw new NotFoundError('Claim line');
  const certified = money(certifiedAmount, currency);
  const label = lineLabel(state, claimLineId);
  assertCertifiedNotAboveSubmitted({ submitted: line.figures.currentSubmitted, certified, lineLabel: label });
  assertWithinCeiling({
    revised: line.figures.revisedValue,
    priorCertified: line.figures.priorCertified,
    current: certified,
    kind: 'certified',
    lineLabel: label,
  });
  return { line, certified };
}

async function appendBasis(
  tx: OrgContext['db'],
  context: OrgContext,
  claim: ClaimRow,
  state: ClaimState,
  certifiedByLine: ReadonlyMap<string, string>,
  sourceDecision: 'certify' | 'reassess',
): Promise<string> {
  const currency = claim.currency;
  const certifiedTotal = sumMoney(
    state.lines.map((line) => money(certifiedByLine.get(line.claimLineId) ?? '0', currency)),
    currency,
  );
  const { basis, version } = await computeNextBasis(tx, {
    organizationId: context.organizationId,
    agreementId: claim.agreementId,
    claimId: claim.id,
    agreement: state.agreement,
    certifiedTotal,
  });
  return insertBasis(tx, {
    organizationId: context.organizationId,
    projectId: claim.projectId,
    vendorId: claim.vendorId,
    agreementId: claim.agreementId,
    claimId: claim.id,
    version,
    sourceDecision,
    currency,
    certifiedTotal: basis.certifiedTotal.amount,
    certifiedDelta: basis.certifiedDelta.amount,
    retentionPercent: basis.retentionPercent,
    retentionAmount: basis.retentionAmount.amount,
    advanceRecoveryAmount: basis.advanceRecoveryAmount.amount,
    deductionsAmount: basis.deductionsAmount.amount,
    payableNet: basis.payableNet.amount,
    apBillStatus: basis.apBillStatus,
    createdByUserId: context.userId,
  });
}

/**
 * Certifies every line of the submitted revision. Certifying less than claimed needs a reason; certifying
 * zero is a line rejection. The claimed values stay untouched in the submitted revision.
 */
export async function certifyClaim(
  context: OrgContext,
  projectId: string,
  claimId: string,
  raw: CertifyClaimInput,
): Promise<{ basisId: string }> {
  const input = parseOrThrow(certifyClaimSchema.safeParse(raw));
  await assertProjectCapability(context, projectId, C.CLAIM_CERTIFY);
  const actor = internalActor(context.userId);
  let cashDelivery: {
    readonly developerOrganizationId: string;
    readonly subcontractAgreementId: string;
    readonly payableBasisId: string;
  } | null = null;
  const { basisId } = await withTransaction(context.db, async (tx) => {
    const claim = await lockForReview(tx, context, projectId, claimId);
    assertTransition(claim.status, 'certified', 'internal');
    const state = await loadClaimState(tx, context.organizationId, claim);
    assertCompleteLineSet(
      state.lines.map((line) => line.claimLineId),
      input.lines.map((line) => line.claimLineId),
    );
    const certifiedByLine = new Map<string, string>();
    const rows = input.lines.map((entry) => {
      const { line, certified } = validateLineDecision(state, entry.claimLineId, entry.certifiedAmount, claim.currency);
      const reduced = compareMoney(certified, line.figures.currentSubmitted) < 0;
      const decision: ClaimAssessmentDecision =
        isZeroMoney(certified) && isPositiveMoney(line.figures.currentSubmitted) ? 'reject_line' : 'certify';
      const reason =
        reduced || decision === 'reject_line'
          ? requireReason(entry.reason, 'subcontractClaims.errors.reasonRequiredForReduction')
          : (entry.reason ?? null);
      certifiedByLine.set(entry.claimLineId, certified.amount);
      return {
        organizationId: context.organizationId,
        projectId,
        claimId: claim.id,
        revisionId: state.activeRevision.id,
        claimLineId: entry.claimLineId,
        decision,
        certifiedAmount: certified.amount,
        currency: claim.currency,
        reason,
        assessorUserId: context.userId,
      };
    });
    await insertAssessments(tx, rows);
    await updateClaimRow(tx, context.organizationId, claim.id, { status: 'certified', certifiedAt: new Date() });
    const basisId = await appendBasis(tx, context, claim, state, certifiedByLine, 'certify');
    const basisRow = await findBasis(tx, context.organizationId, basisId);
    if (basisRow) {
      await enqueueClaimCashProjectionSync(tx, {
        developerOrganizationId: context.organizationId,
        subcontractAgreementId: claim.agreementId,
        claimId: claim.id,
        payableBasisId: basisId,
        sourceVersion: basisRow.version,
      });
      cashDelivery = {
        developerOrganizationId: context.organizationId,
        subcontractAgreementId: claim.agreementId,
        payableBasisId: basisId,
      };
    }
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_CERTIFIED,
      entityType: CLAIM_ENTITY,
      entityId: claim.id,
      after: { status: 'certified', revisionNo: claim.currentRevisionNo, basisId },
    });
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId,
      type: DOMAIN_EVENTS.SUBCONTRACT_CLAIM_CERTIFIED,
      entityType: CLAIM_ENTITY,
      entityId: claim.id,
      actor,
      payload: claimEventPayload(claim, 'certified', claim.currentRevisionNo),
    });
    return { basisId };
  });
  if (cashDelivery) await deliverCertifiedCashProjectionUpsert(cashDelivery);
  return { basisId };
}

/**
 * Reassessment of a certified claim: appends `reassess` decisions (reason mandatory) for the given lines,
 * keeps every earlier decision, and appends a payable basis for the difference.
 */
export async function reassessClaim(
  context: OrgContext,
  projectId: string,
  claimId: string,
  raw: ReassessClaimInput,
): Promise<{ basisId: string }> {
  const input = parseOrThrow(reassessClaimSchema.safeParse(raw));
  await assertProjectCapability(context, projectId, C.CLAIM_CERTIFY);
  const reason = requireReason(input.reason, 'subcontractClaims.errors.reasonRequired');
  const actor = internalActor(context.userId);
  let cashDelivery: {
    readonly developerOrganizationId: string;
    readonly subcontractAgreementId: string;
    readonly payableBasisId: string;
  } | null = null;
  const { basisId } = await withTransaction(context.db, async (tx) => {
    const claim = await lockForReview(tx, context, projectId, claimId);
    assertCertified(claim.status);
    const state = await loadClaimState(tx, context.organizationId, claim);
    const latestByLine = new Map<string, string>();
    for (const row of state.assessments) {
      if (row.claimLineId && row.certifiedAmount !== null) latestByLine.set(row.claimLineId, row.id);
    }
    const certifiedByLine = new Map<string, string>(
      [...state.effectiveCertified].map(([lineId, amount]) => [lineId, amount.amount]),
    );
    const seen = new Set<string>();
    const rows = input.lines.map((entry) => {
      if (seen.has(entry.claimLineId)) {
        throw new DomainRuleError('Duplicate claim line', 'subcontractClaims.errors.unknownLine');
      }
      seen.add(entry.claimLineId);
      const { certified } = validateLineDecision(state, entry.claimLineId, entry.certifiedAmount, claim.currency);
      certifiedByLine.set(entry.claimLineId, certified.amount);
      return {
        organizationId: context.organizationId,
        projectId,
        claimId: claim.id,
        revisionId: state.activeRevision.id,
        claimLineId: entry.claimLineId,
        decision: 'reassess' as const,
        certifiedAmount: certified.amount,
        currency: claim.currency,
        reason,
        supersedesAssessmentId: latestByLine.get(entry.claimLineId) ?? null,
        assessorUserId: context.userId,
      };
    });
    await insertAssessments(tx, rows);
    await updateClaimRow(tx, context.organizationId, claim.id, { lastReassessedAt: new Date() });
    const basisId = await appendBasis(tx, context, claim, state, certifiedByLine, 'reassess');
    const basisRow = await findBasis(tx, context.organizationId, basisId);
    if (basisRow) {
      await enqueueClaimCashProjectionSync(tx, {
        developerOrganizationId: context.organizationId,
        subcontractAgreementId: claim.agreementId,
        claimId: claim.id,
        payableBasisId: basisId,
        sourceVersion: basisRow.version,
      });
      cashDelivery = {
        developerOrganizationId: context.organizationId,
        subcontractAgreementId: claim.agreementId,
        payableBasisId: basisId,
      };
    }
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_REASSESSED,
      entityType: CLAIM_ENTITY,
      entityId: claim.id,
      after: { lineCount: rows.length, basisId },
    });
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId,
      type: DOMAIN_EVENTS.SUBCONTRACT_CLAIM_REASSESSED,
      entityType: CLAIM_ENTITY,
      entityId: claim.id,
      actor,
      payload: claimEventPayload(claim, 'certified', claim.currentRevisionNo),
    });
    return { basisId };
  });
  if (cashDelivery) await deliverCertifiedCashProjectionUpsert(cashDelivery);
  return { basisId };
}

/**
 * Payable basis -> DRAFT AP bill through the AP module (never posted, never paid here). The bill is NET of
 * applied deductions; VAT is computed by the AP tax engine; retention is captured on the bill as cash timing.
 * Requires payment.manage on the project AND the organization's AP manage permission (enforced by AP).
 */
export async function createDraftApBillFromBasis(
  context: OrgContext,
  projectId: string,
  basisId: string,
  options: { notes?: string | null; reference?: string | null } = {},
): Promise<{ apBillId: string }> {
  await assertProjectCapability(context, projectId, C.PAYMENT_MANAGE);
  const basis = await findBasis(context.db, context.organizationId, basisId);
  if (!basis || basis.projectId !== projectId) throw new NotFoundError('Payable basis');
  if (basis.apBillStatus !== 'pending') {
    throw new ConflictError('The payable basis has no pending AP bill', 'subcontractClaims.errors.apBillNotPending');
  }
  const currency = basis.currency;
  const billNet = subtractMoney(money(basis.certifiedDelta, currency), money(basis.deductionsAmount, currency));
  if (!isPositiveMoney(billNet)) {
    throw new DomainRuleError('Nothing to bill for this basis', 'subcontractClaims.errors.apBillNotPending');
  }
  if (!(await moveBasisApStatus(context.db, context.organizationId, basisId, 'pending', 'requested'))) {
    throw new ConflictError('AP bill already requested', 'subcontractClaims.errors.apBillNotPending');
  }
  try {
    const bill = await createDraftApBill(context, {
      vendorId: basis.vendorId,
      projectId,
      subcontractAgreementId: basis.agreementId,
      currency,
      totalAmount: billNet.amount,
      amountIncludesTax: false,
      retentionAmount: isPositiveMoney(money(basis.retentionAmount, currency)) ? basis.retentionAmount : null,
      reference: options.reference ?? null,
      notes: options.notes ?? null,
      lines: [
        {
          description: options.reference ?? 'Progress claim',
          quantity: '1',
          unitAmount: billNet.amount,
          lineTotal: billNet.amount,
          currency,
          economicTargetType: 'project',
          projectId,
        },
      ],
    });
    await withTransaction(context.db, async (tx) => {
      await moveBasisApStatus(tx, context.organizationId, basisId, 'requested', 'created', bill.id);
      await recordInternalAudit(tx, context, {
        action: AUDIT_ACTIONS.SUBCONTRACT_CLAIM_AP_BILL_DRAFTED,
        entityType: CLAIM_ENTITY,
        entityId: basis.claimId,
        after: { basisId, apBillId: bill.id, status: 'draft' },
      });
    });
    return { apBillId: bill.id };
  } catch (error) {
    try {
      await moveBasisApStatus(context.db, context.organizationId, basisId, 'requested', 'pending');
    } catch {
      // The surrounding transaction already rolled back the request.
    }
    throw error;
  }
}