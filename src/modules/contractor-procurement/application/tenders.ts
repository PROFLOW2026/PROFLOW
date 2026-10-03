import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent, writeAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import {
  EXTERNAL_CAPABILITIES as X,
  requireExternalScope,
  type ExternalContext,
} from '@/shared/external';
import { money, toNumericString } from '@/shared/money';
import { recordExternalAudit } from '@/modules/contractor-compliance';
import { PROJECT_CAPABILITIES as C, assertProjectCapability, hasProjectCapability } from '@/modules/project-team';
import { createDraftAgreement } from '@/modules/subcontracts';
import { assertOfferSelectable, assertPackageAwardable } from '../domain/award-rules';
import { TENDER_OFFER_ENTITY, TENDER_PACKAGE_ENTITY, type TenderPackageRow } from '../domain/types';
import {
  findInvitationForVendor,
  findOffer,
  findTenderPackage,
  insertInvitation,
  insertOffer,
  insertTenderPackage,
  listOfferFinancialsForPackage,
  listOffersForPackage,
  listTenderPackages,
  updateOffer,
  updateTenderPackage,
  upsertOfferFinancials,
} from '../data/tenders.repository';
import {
  awardTenderSchema,
  createTenderPackageSchema,
  inviteVendorSchema,
  submitBidSchema,
  type AwardTenderInput,
  type CreateTenderPackageInput,
  type InviteVendorInput,
  type SubmitBidInput,
} from '../validation/schemas';

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ValidationError([]);
  return result.data;
}

export async function listProjectTenderPackages(context: OrgContext, projectId: string) {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  return listTenderPackages(context.db, context.organizationId, projectId);
}

export async function getTenderPackageDetail(
  context: OrgContext,
  input: { readonly projectId: string; readonly packageId: string },
) {
  await assertProjectCapability(context, input.projectId, C.PROJECT_VIEW);
  const pkg = await findTenderPackage(context.db, context.organizationId, input.packageId);
  if (!pkg || pkg.projectId !== input.projectId) throw new NotFoundError('Tender package');
  const offers = await listOffersForPackage(context.db, context.organizationId, input.packageId);
  const canSeeMoney = await hasProjectCapability(context, input.projectId, C.CONTRACT_FINANCIAL_VIEW);
  const financials = canSeeMoney
    ? await listOfferFinancialsForPackage(context.db, context.organizationId, input.packageId)
    : [];
  return { pkg, offers, financials, canManage: await hasProjectCapability(context, input.projectId, C.CONTRACT_MANAGE) };
}

export async function createTenderPackage(context: OrgContext, raw: CreateTenderPackageInput) {
  const input = parse(createTenderPackageSchema, raw);
  await assertProjectCapability(context, input.projectId, C.CONTRACT_MANAGE);
  const id = await insertTenderPackage(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    tradeKey: input.tradeKey,
    title: input.title,
    scopeDescription: input.scopeDescription ?? null,
    workPackageId: input.workPackageId ?? null,
    status: 'draft',
    createdByUserId: context.userId,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.TENDER_PACKAGE_CREATED,
    entityType: TENDER_PACKAGE_ENTITY,
    entityId: id,
    metadata: { projectId: input.projectId },
  });
  return { packageId: id };
}

export async function inviteVendorToTender(context: OrgContext, raw: InviteVendorInput) {
  const input = parse(inviteVendorSchema, raw);
  await assertProjectCapability(context, input.projectId, C.CONTRACT_MANAGE);
  const pkg = await findTenderPackage(context.db, context.organizationId, input.packageId);
  if (!pkg || pkg.projectId !== input.projectId) throw new NotFoundError('Tender package');
  const invitationId = await insertInvitation(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    packageId: input.packageId,
    vendorId: input.vendorId,
    invitedByUserId: context.userId,
  });
  if (pkg.status === 'draft') {
    await updateTenderPackage(context.db, context.organizationId, input.packageId, { status: 'inviting' });
  }
  return { invitationId };
}

export async function awardTenderToSubcontract(context: OrgContext, raw: AwardTenderInput) {
  const input = parse(awardTenderSchema, raw);
  await assertProjectCapability(context, input.projectId, C.CONTRACT_MANAGE);
  const pkg = await findTenderPackage(context.db, context.organizationId, input.packageId);
  if (!pkg || pkg.projectId !== input.projectId) throw new NotFoundError('Tender package');
  const offer = await findOffer(context.db, context.organizationId, input.offerId);
  if (!offer || offer.packageId !== input.packageId) throw new NotFoundError('Tender offer');
  assertPackageAwardable(pkg);
  assertOfferSelectable(offer, offer.vendorId);

  const agreement = await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const { agreementId } = await createDraftAgreement(txContext, {
      projectId: input.projectId,
      vendorId: offer.vendorId,
      title: input.title ?? pkg.title,
      subcontractNumber: input.subcontractNumber,
      workPackageId: pkg.workPackageId ?? undefined,
    });
    await updateOffer(tx, context.organizationId, offer.id, { status: 'selected' });
    await updateTenderPackage(tx, context.organizationId, input.packageId, {
      status: 'awarded',
      awardedVendorId: offer.vendorId,
      awardedAgreementId: agreementId,
      awardedAt: new Date(),
      awardedByUserId: context.userId,
    });
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      type: DOMAIN_EVENTS.PROCUREMENT_TENDER_AWARDED,
      entityType: TENDER_PACKAGE_ENTITY,
      entityId: input.packageId,
      actor: internalActor(context.userId),
      payload: { agreementId, vendorId: offer.vendorId, offerId: offer.id },
    });
    await writeAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.TENDER_AWARDED,
      entityType: TENDER_PACKAGE_ENTITY,
      entityId: input.packageId,
      metadata: { agreementId, offerId: offer.id },
    });
    return agreementId;
  });
  return { agreementId: agreement };
}

/** Portal: packages this vendor is invited to bid on. */
export async function listPortalTenders(context: ExternalContext, input: { readonly organizationId: string; readonly projectId: string }) {
  const seed = context.grants.find(
    (g) =>
      g.organizationId === input.organizationId &&
      g.capabilities.has(X.BID_SUBMIT) &&
      (!g.projectId || g.projectId === input.projectId),
  );
  if (!seed) return [];
  const grant = requireExternalScope(
    context,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      vendorId: seed.vendorId,
      subcontractAgreementId: null,
    },
    X.BID_SUBMIT,
  );
  const vendorId = grant.vendorId;
  const packages = await listTenderPackages(context.db, input.organizationId, input.projectId);
  const visible: TenderPackageRow[] = [];
  for (const pkg of packages) {
    const invitation = await findInvitationForVendor(context.db, input.organizationId, pkg.id, vendorId);
    if (invitation) visible.push(pkg);
  }
  return visible;
}

export async function submitContractorBid(context: ExternalContext, raw: SubmitBidInput) {
  const input = parse(submitBidSchema, raw);
  const grant = context.grants.find(
    (g) => g.organizationId === input.organizationId && g.vendorId && (!g.projectId || g.projectId === input.projectId),
  );
  if (!grant?.vendorId) throw new NotFoundError('Grant');
  requireExternalScope(
    context,
    { organizationId: input.organizationId, projectId: input.projectId, vendorId: grant.vendorId, subcontractAgreementId: null },
    X.BID_SUBMIT,
  );
  const invitation = await findInvitationForVendor(context.db, input.organizationId, input.packageId, grant.vendorId);
  if (!invitation) throw new NotFoundError('Tender invitation');
  const pkg = await findTenderPackage(context.db, input.organizationId, input.packageId);
  if (!pkg || pkg.projectId !== input.projectId || pkg.status === 'awarded' || pkg.status === 'cancelled') {
    throw new NotFoundError('Tender package');
  }
  const existingOffers = await listOffersForPackage(context.db, input.organizationId, input.packageId);
  if (existingOffers.some((row) => row.vendorId === grant.vendorId && row.status === 'submitted')) {
    throw new DomainRuleError('Bid already submitted', 'awards.errors.bidAlreadySubmitted');
  }

  const offerId = await withTransaction(context.db, async (tx) => {
    const id = await insertOffer(tx, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      packageId: input.packageId,
      vendorId: grant.vendorId,
      invitationId: invitation.id,
      notes: input.notes ?? null,
      status: 'draft',
      submittedActorType: 'external',
      submittedByPrincipalId: context.principalId,
      submittedAt: null,
    });
    await upsertOfferFinancials(tx, {
      offerId: id,
      organizationId: input.organizationId,
      bidAmount: toNumericString(money(input.bidAmount, 'ILS')),
      currency: 'ILS',
      leadTimeDays: input.leadTimeDays ?? null,
    });
    await updateOffer(tx, input.organizationId, id, {
      status: 'submitted',
      submittedAt: new Date(),
    });
    return id;
  });
  await recordExternalAudit(context.db, {
    organizationId: input.organizationId,
    principalId: context.principalId,
    action: AUDIT_ACTIONS.TENDER_BID_SUBMITTED,
    entityType: TENDER_OFFER_ENTITY,
    entityId: offerId,
    after: { projectId: input.projectId, packageId: input.packageId },
  });
  return { offerId };
}
