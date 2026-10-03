import { PROJECT_CAPABILITIES as C, assertProjectCapability } from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import { AUDIT_ACTIONS } from '@/shared/audit';
import { internalActor } from '@/shared/actor';
import { withTransaction } from '@/shared/db';
import type { DbExecutor } from '@/shared/db/types';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { NotFoundError } from '@/shared/errors';
import { money } from '@/shared/money';
import { assertReversible } from '../domain/deductions';
import { DEDUCTION_ENTITY, type DeductionView } from '../domain/types';
import { findClaim } from '../data/claims.repository';
import {
  findDeduction,
  insertDeduction,
  insertDispute,
  listAgreementDeductionFacts,
  listDeductionRows,
  listDisputes,
  type DeductionListRow,
} from '../data/financial.repository';
import {
  disputeCommentSchema,
  issueDeductionSchema,
  reasonSchema,
  type DisputeCommentInput,
  type IssueDeductionInput,
  type ReasonInput,
} from '../validation/schemas';
import { loadAgreementContext } from './claim-engine';
import { isoOrNull, parseOrThrow, recordInternalAudit } from './support';

/** Deduction payloads never carry the amount (financial-only consumers re-read with their own access). */
function deductionPayload(row: { id: string; agreementId: string; vendorId: string; claimId: string | null }, kind: string) {
  return { deductionId: row.id, agreementId: row.agreementId, vendorId: row.vendorId, claimId: row.claimId, entryKind: kind };
}

export async function toDeductionViews(
  db: DbExecutor,
  organizationId: string,
  rows: readonly DeductionListRow[],
): Promise<DeductionView[]> {
  const disputes = await listDisputes(
    db,
    organizationId,
    rows.map((row) => row.id),
  );
  const reversed = new Map<string, string>();
  for (const row of rows) if (row.reversalOfId) reversed.set(row.reversalOfId, row.id);
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    agreementId: row.agreementId,
    claimId: row.claimId,
    claimNumber: row.claimNumber,
    entryKind: row.entryKind,
    reversalOfId: row.reversalOfId,
    reversedById: reversed.get(row.id) ?? null,
    deductionType: row.deductionType,
    amount: row.amount,
    currency: row.currency,
    reason: row.reason,
    contractorVisible: row.contractorVisible,
    createdAt: row.createdAt.toISOString(),
    disputes: disputes
      .filter((dispute) => dispute.deductionId === row.id)
      .map((dispute) => ({
        id: dispute.id,
        comment: dispute.comment,
        actorType: dispute.actorType,
        createdAt: isoOrNull(dispute.createdAt) ?? '',
      })),
  }));
}

export async function listProjectDeductions(
  context: OrgContext,
  projectId: string,
  options: { agreementId?: string | null } = {},
): Promise<DeductionView[]> {
  await assertProjectCapability(context, projectId, C.CLAIM_VIEW);
  const rows = await listDeductionRows(context.db, context.organizationId, {
    projectId,
    agreementId: options.agreementId ?? null,
  });
  return toDeductionViews(context.db, context.organizationId, rows);
}

export async function issueDeduction(context: OrgContext, raw: IssueDeductionInput): Promise<{ deductionId: string }> {
  const input = parseOrThrow(issueDeductionSchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.DEDUCTIONS_MANAGE);
  const agreement = await loadAgreementContext(context.db, context.organizationId, input.agreementId);
  if (agreement.terms.projectId !== input.projectId) throw new NotFoundError('Subcontract agreement');
  if (input.claimId) {
    const claim = await findClaim(context.db, context.organizationId, input.claimId);
    if (!claim || claim.agreementId !== input.agreementId) throw new NotFoundError('Claim');
  }
  const actor = internalActor(context.userId);
  return withTransaction(context.db, async (tx) => {
    const id = await insertDeduction(tx, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      vendorId: agreement.terms.vendorId,
      agreementId: input.agreementId,
      claimId: input.claimId ?? null,
      entryKind: 'issue',
      deductionType: input.deductionType,
      amount: money(input.amount, agreement.terms.currency).amount,
      currency: agreement.terms.currency,
      reason: input.reason,
      contractorVisible: input.contractorVisible ?? true,
      issuedByUserId: context.userId,
    });
    const row = { id, agreementId: input.agreementId, vendorId: agreement.terms.vendorId, claimId: input.claimId ?? null };
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_DEDUCTION_ISSUED,
      entityType: DEDUCTION_ENTITY,
      entityId: id,
      after: { deductionType: input.deductionType, contractorVisible: input.contractorVisible ?? true },
    });
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      type: DOMAIN_EVENTS.SUBCONTRACT_DEDUCTION_ISSUED,
      entityType: DEDUCTION_ENTITY,
      entityId: id,
      actor,
      payload: { ...deductionPayload(row, 'issue'), contractorVisible: input.contractorVisible ?? true },
    });
    return { deductionId: id };
  });
}

/** Correction = a reversal row mirroring the issued deduction (the original row is never edited). */
export async function reverseDeduction(
  context: OrgContext,
  projectId: string,
  deductionId: string,
  raw: ReasonInput,
): Promise<{ reversalId: string }> {
  const input = parseOrThrow(reasonSchema.safeParse(raw));
  await assertProjectCapability(context, projectId, C.DEDUCTIONS_MANAGE);
  const actor = internalActor(context.userId);
  return withTransaction(context.db, async (tx) => {
    const target = await findDeduction(tx, context.organizationId, deductionId);
    if (!target || target.projectId !== projectId) throw new NotFoundError('Deduction');
    const facts = await listAgreementDeductionFacts(tx, context.organizationId, target.agreementId);
    assertReversible(target, facts);
    const id = await insertDeduction(tx, {
      organizationId: context.organizationId,
      projectId,
      vendorId: target.vendorId,
      agreementId: target.agreementId,
      claimId: target.claimId,
      entryKind: 'reversal',
      reversalOfId: target.id,
      deductionType: target.deductionType,
      amount: target.amount,
      currency: target.currency,
      reason: input.reason,
      contractorVisible: target.contractorVisible,
      issuedByUserId: context.userId,
    });
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_DEDUCTION_REVERSED,
      entityType: DEDUCTION_ENTITY,
      entityId: target.id,
      after: { reversalId: id },
    });
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId,
      type: DOMAIN_EVENTS.SUBCONTRACT_DEDUCTION_REVERSED,
      entityType: DEDUCTION_ENTITY,
      entityId: target.id,
      actor,
      payload: deductionPayload(target, 'reversal'),
    });
    return { reversalId: id };
  });
}

/** Internal reply in a deduction dispute thread (append-only). */
export async function replyToDeductionDispute(
  context: OrgContext,
  projectId: string,
  deductionId: string,
  raw: DisputeCommentInput,
): Promise<void> {
  const input = parseOrThrow(disputeCommentSchema.safeParse(raw));
  await assertProjectCapability(context, projectId, C.DEDUCTIONS_MANAGE);
  await withTransaction(context.db, async (tx) => {
    const target = await findDeduction(tx, context.organizationId, deductionId);
    if (!target || target.projectId !== projectId) throw new NotFoundError('Deduction');
    await insertDispute(tx, {
      organizationId: context.organizationId,
      projectId,
      agreementId: target.agreementId,
      deductionId,
      comment: input.comment,
      actorType: 'internal',
      actorUserId: context.userId,
    });
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_DEDUCTION_DISPUTED,
      entityType: DEDUCTION_ENTITY,
      entityId: deductionId,
      after: { actor: 'internal' },
    });
  });
}