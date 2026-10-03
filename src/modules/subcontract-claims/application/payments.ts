import { PROJECT_CAPABILITIES as C, assertProjectCapability } from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import { AUDIT_ACTIONS } from '@/shared/audit';
import { internalActor } from '@/shared/actor';
import { withTransaction } from '@/shared/db';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { NotFoundError } from '@/shared/errors';
import { findClaim } from '../data/claims.repository';
import { findHold, insertHold, releaseHoldRow } from '../data/financial.repository';
import { placeHoldSchema, releaseHoldSchema, type PlaceHoldInput, type ReleaseHoldInput } from '../validation/schemas';
import { loadAgreementContext } from './claim-engine';
import { loadAgreementPaymentStatus, type AgreementPaymentStatus } from './payables';
import { parseOrThrow, recordInternalAudit } from './support';

const HOLD_ENTITY = 'payment_hold';

export async function getAgreementPayments(
  context: OrgContext,
  projectId: string,
  agreementId: string,
): Promise<AgreementPaymentStatus> {
  await assertProjectCapability(context, projectId, C.PAYMENT_VIEW);
  const agreement = await loadAgreementContext(context.db, context.organizationId, agreementId);
  if (agreement.terms.projectId !== projectId) throw new NotFoundError('Subcontract agreement');
  return loadAgreementPaymentStatus(context.db, {
    organizationId: context.organizationId,
    agreementId,
    agreement,
    contractorView: false,
  });
}

export async function placePaymentHold(context: OrgContext, raw: PlaceHoldInput): Promise<{ holdId: string }> {
  const input = parseOrThrow(placeHoldSchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.PAYMENT_MANAGE);
  const agreement = await loadAgreementContext(context.db, context.organizationId, input.agreementId);
  if (agreement.terms.projectId !== input.projectId) throw new NotFoundError('Subcontract agreement');
  if (input.claimId) {
    const claim = await findClaim(context.db, context.organizationId, input.claimId);
    if (!claim || claim.agreementId !== input.agreementId) throw new NotFoundError('Claim');
  }
  const actor = internalActor(context.userId);
  return withTransaction(context.db, async (tx) => {
    const holdId = await insertHold(tx, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      vendorId: agreement.terms.vendorId,
      agreementId: input.agreementId,
      claimId: input.claimId ?? null,
      holdKind: input.holdKind,
      note: input.note,
      contractorVisible: input.contractorVisible ?? true,
      placedByUserId: context.userId,
    });
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_PAYMENT_HOLD_PLACED,
      entityType: HOLD_ENTITY,
      entityId: holdId,
      after: { holdKind: input.holdKind, agreementId: input.agreementId, claimId: input.claimId ?? null },
    });
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      type: DOMAIN_EVENTS.SUBCONTRACT_PAYMENT_HOLD_PLACED,
      entityType: HOLD_ENTITY,
      entityId: holdId,
      actor,
      payload: { holdId, holdKind: input.holdKind, agreementId: input.agreementId, vendorId: agreement.terms.vendorId },
    });
    return { holdId };
  });
}

export async function releasePaymentHold(
  context: OrgContext,
  projectId: string,
  holdId: string,
  raw: ReleaseHoldInput,
): Promise<void> {
  const input = parseOrThrow(releaseHoldSchema.safeParse(raw));
  await assertProjectCapability(context, projectId, C.PAYMENT_MANAGE);
  const actor = internalActor(context.userId);
  await withTransaction(context.db, async (tx) => {
    const hold = await findHold(tx, context.organizationId, holdId);
    if (!hold || hold.projectId !== projectId) throw new NotFoundError('Payment hold');
    if (!(await releaseHoldRow(tx, context.organizationId, holdId, { releasedByUserId: context.userId, releaseNote: input.releaseNote }))) {
      throw new NotFoundError('Payment hold');
    }
    await recordInternalAudit(tx, context, {
      action: AUDIT_ACTIONS.SUBCONTRACT_PAYMENT_HOLD_RELEASED,
      entityType: HOLD_ENTITY,
      entityId: holdId,
      after: { released: true },
    });
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId,
      type: DOMAIN_EVENTS.SUBCONTRACT_PAYMENT_HOLD_RELEASED,
      entityType: HOLD_ENTITY,
      entityId: holdId,
      actor,
      payload: { holdId, holdKind: hold.holdKind, agreementId: hold.agreementId, vendorId: hold.vendorId },
    });
  });
}
