/**
 * Subcontractor agreements on top of vendors.
 *
 * Commitment ≠ expense. Current value = original event + approved
 * change_order/adjustment events. Never mutates original. Never posts AP.
 */

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { todayInTimeZone } from '@/shared/dates';
import { withTransaction } from '@/shared/db';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money, toNumericString } from '@/shared/money';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { linkDocumentToEntity } from '@/modules/documents/application/link-document';
import {
  resolveDocumentPaymentTermId,
} from '@/modules/business-catalog';
import { resolveOrgDefaultPaymentTermIdForContext } from '@/modules/business-catalog/application/payment-term-defaults';
import {
  assertCanAccessProject,
  isAccessibleProjectId,
  resolveAccessibleProjectIds,
} from '@/modules/projects/application/project-access';
import { findProjectById, findVendorById, updateVendorById } from '../data/vendors.repository';
import {
  findContractInOrg,
  findDocumentInOrg,
  findSubcontractAgreementById,
  findSubcontractAgreementByIdForUpdate,
  insertSubcontractAgreement,
  insertSubcontractValueEvent,
  listApBillCashForSubcontractAgreement,
  listLinkableDocuments,
  listOrgSubcontracts as listOrgSubcontractsRows,
  listParentContractOptions,
  listSubcontractLinkedDocuments,
  listSubcontractValueEvents,
  listSubcontractsForProject,
  listSubcontractsForVendor,
  updateDocumentRequirementFlags,
  updateSubcontractAgreementById,
} from '../data/subcontracts.repository';
import { computeSubcontractCashPosition } from '../domain/subcontract-cash';
import { assessSubcontractDocuments } from '../domain/subcontract-documents';
import {
  assertCanRelinkParties,
  assertSubcontractAcceptsValueChange,
  assertSubcontractMetadataEditable,
  assertSubcontractStatusTransition,
} from '../domain/subcontract-lifecycle';
import type {
  SubcontractDetail,
  SubcontractListItem,
  SubcontractParentContractOption,
  SubcontractStatus,
} from '../domain/subcontract-types';
import {
  computeSubcontractValuePosition,
  signedSubcontractChangeAmount,
} from '../domain/subcontract-value';
import {
  addSubcontractValueChangeSchema,
  changeSubcontractStatusSchema,
  createSubcontractSchema,
  linkSubcontractDocumentSchema,
  listOrgSubcontractsSchema,
  updateSubcontractSchema,
  type AddSubcontractValueChangeInput,
  type ChangeSubcontractStatusInput,
  type CreateSubcontractInput,
  type LinkSubcontractDocumentInput,
  type ListOrgSubcontractsInput,
  type UpdateSubcontractInput,
} from '../validation/schemas';

function parseOrThrow<T>(
  parsed: { success: true; data: T } | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } },
): T {
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return parsed.data;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23505';
}

async function loadDetail(
  context: OrgContext,
  subcontractId: string,
): Promise<SubcontractDetail> {
  const agreement = await findSubcontractAgreementById(
    context.db,
    context.organizationId,
    subcontractId,
  );
  if (!agreement) throw new NotFoundError('Subcontract');

  const [vendor, project, events, cashRows, docs] = await Promise.all([
    findVendorById(context.db, context.organizationId, agreement.vendorId),
    findProjectById(context.db, context.organizationId, agreement.projectId),
    listSubcontractValueEvents(context.db, context.organizationId, agreement.id),
    listApBillCashForSubcontractAgreement(
      context.db,
      context.organizationId,
      agreement.id,
    ),
    listSubcontractLinkedDocuments(context.db, context.organizationId, agreement.id),
  ]);

  const parent = agreement.parentContractId
    ? await findContractInOrg(context.db, context.organizationId, agreement.parentContractId)
    : null;

  const position = computeSubcontractValuePosition({
    events,
    currency: agreement.currency,
    originalValueFallback: agreement.originalAmount,
  });
  const today = todayInTimeZone(context.organization.timezone);

  return {
    ...agreement,
    vendorName: vendor?.name ?? '',
    projectName: project?.name ?? '',
    parentContractLabel: parent?.label ?? null,
    events,
    originalAmountDerived: position.originalAmount.amount,
    approvedChangesAmount: position.approvedChanges.amount,
    currentAmount: position.currentAmount.amount,
    cash: computeSubcontractCashPosition(cashRows, agreement.currency),
    documents: docs,
    documentFlags: assessSubcontractDocuments(docs, today),
  };
}

async function assertVendorAndProject(
  context: OrgContext,
  vendorId: string,
  projectId: string,
): Promise<void> {
  const vendor = await findVendorById(context.db, context.organizationId, vendorId);
  if (!vendor || vendor.archivedAt) throw new NotFoundError('Vendor');
  assertSameOrganization(context, vendor, 'Vendor');

  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  await assertCanAccessProject(context, projectId);
}

async function assertParentContract(
  context: OrgContext,
  parentContractId: string | null | undefined,
  projectId: string,
): Promise<void> {
  if (!parentContractId) return;
  const contract = await findContractInOrg(context.db, context.organizationId, parentContractId);
  if (!contract) throw new NotFoundError('Contract');
  if (contract.projectId !== projectId) {
    throw new ValidationError([
      { path: 'parentContractId', message: 'Parent contract must belong to the same project' },
    ]);
  }
}

export async function createSubcontract(
  context: OrgContext,
  rawInput: CreateSubcontractInput,
): Promise<SubcontractDetail> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);
  const input = parseOrThrow(createSubcontractSchema.safeParse(rawInput));

  await assertVendorAndProject(context, input.vendorId, input.projectId);
  await assertParentContract(context, input.parentContractId, input.projectId);

  const vendor = await findVendorById(context.db, context.organizationId, input.vendorId);
  if (!vendor || vendor.archivedAt) throw new NotFoundError('Vendor');

  if (vendor.type === 'other') {
    throw new DomainRuleError(
      'Vendor type "other" cannot receive a subcontract. Change the vendor type to subcontractor or both first.',
      'vendors.subcontracts.errors.vendorTypeOther',
      { vendorId: vendor.id, vendorType: vendor.type },
    );
  }

  if (vendor.type === 'supplier') {
    if (!input.promoteVendorToBoth) {
      throw new DomainRuleError(
        'This vendor is a supplier. Confirm promoteVendorToBoth to also mark them as a subcontractor (type both), or change the type first.',
        'vendors.subcontracts.errors.supplierNeedsPromote',
        { vendorId: vendor.id, vendorType: vendor.type },
      );
    }
  }

  const currency = context.organization.baseCurrency.toUpperCase();
  const original = money(input.originalAmount, currency);
  const effectiveDate =
    input.startDate ?? todayInTimeZone(context.organization.timezone);

  const orgDefaultId = await resolveOrgDefaultPaymentTermIdForContext(context);
  const paymentTermId = resolveDocumentPaymentTermId({
    explicitId: input.paymentTermId,
    partyDefaultId: vendor.defaultPaymentTermId ?? null,
    orgDefaultId,
  });

  const agreementId = await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };

    if (vendor.type === 'supplier' && input.promoteVendorToBoth) {
      const promoted = await updateVendorById(tx, context.organizationId, vendor.id, {
        type: 'both',
      });
      if (!promoted) throw new NotFoundError('Vendor');
      await recordAuditEvent(txContext, {
        action: AUDIT_ACTIONS.VENDOR_UPDATED,
        entityType: 'vendor',
        entityId: vendor.id,
        before: { type: vendor.type },
        after: { type: 'both', reason: 'subcontract_create_promote' },
      });
    }

    let agreement;
    try {
      agreement = await insertSubcontractAgreement(tx, {
        organizationId: context.organizationId,
        subcontractNumber: input.subcontractNumber ?? null,
        vendorId: input.vendorId,
        projectId: input.projectId,
        parentContractId: input.parentContractId ?? null,
        title: input.title,
        originalAmount: toNumericString(original),
        currency,
        retentionPercent: input.retentionPercent ?? null,
        paymentTermId,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        notes: input.notes ?? null,
        createdByUserId: context.userId,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Subcontract number already exists');
      }
      throw error;
    }

    const locked = await findSubcontractAgreementByIdForUpdate(
      tx,
      context.organizationId,
      agreement.id,
    );
    if (!locked) throw new NotFoundError('Subcontract');

    const events = await listSubcontractValueEvents(tx, context.organizationId, locked.id);
    if (events.some((event) => event.kind === 'original')) {
      throw new ConflictError('Original subcontract value already recorded');
    }

    await insertSubcontractValueEvent(tx, {
      organizationId: context.organizationId,
      subcontractId: locked.id,
      kind: 'original',
      amount: toNumericString(original),
      currency,
      effectiveDate,
      reason: 'Original subcontract amount',
      actorUserId: context.userId,
    });

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.SUBCONTRACT_CREATED,
      entityType: 'subcontract_agreement',
      entityId: locked.id,
      after: locked,
    });

    return locked.id;
  });

  return loadDetail(context, agreementId);
}

export async function updateSubcontract(
  context: OrgContext,
  rawInput: UpdateSubcontractInput,
): Promise<SubcontractDetail> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);
  const input = parseOrThrow(updateSubcontractSchema.safeParse(rawInput));

  const agreementId = await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const existing = await findSubcontractAgreementByIdForUpdate(
      tx,
      context.organizationId,
      input.subcontractId,
    );
    if (!existing) throw new NotFoundError('Subcontract');
    assertSubcontractMetadataEditable(existing.status);

    const nextVendorId = input.vendorId ?? existing.vendorId;
    const nextProjectId = input.projectId ?? existing.projectId;
    const partiesChanging =
      nextVendorId !== existing.vendorId ||
      nextProjectId !== existing.projectId ||
      (input.parentContractId !== undefined && input.parentContractId !== existing.parentContractId);

    if (partiesChanging) {
      assertCanRelinkParties(existing.status);
      await assertVendorAndProject(txContext, nextVendorId, nextProjectId);
    }

    const nextParent =
      input.parentContractId !== undefined ? input.parentContractId : existing.parentContractId;
    await assertParentContract(txContext, nextParent, nextProjectId);

    let updated;
    try {
      updated = await updateSubcontractAgreementById(
        tx,
        context.organizationId,
        input.subcontractId,
        {
          title: input.title,
          subcontractNumber: input.subcontractNumber === undefined ? undefined : input.subcontractNumber,
          vendorId: partiesChanging ? nextVendorId : undefined,
          projectId: partiesChanging ? nextProjectId : undefined,
          parentContractId: input.parentContractId === undefined ? undefined : input.parentContractId,
          retentionPercent:
            input.retentionPercent === undefined ? undefined : input.retentionPercent,
          startDate: input.startDate === undefined ? undefined : input.startDate,
          endDate: input.endDate === undefined ? undefined : input.endDate,
          notes: input.notes === undefined ? undefined : input.notes,
        },
        { fromStatuses: [existing.status] },
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Subcontract number already exists');
      }
      throw error;
    }
    if (!updated) throw new ConflictError('Subcontract was updated concurrently');

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.SUBCONTRACT_UPDATED,
      entityType: 'subcontract_agreement',
      entityId: updated.id,
      before: existing,
      after: updated,
    });
    return updated.id;
  });

  return loadDetail(context, agreementId);
}

export async function changeSubcontractStatus(
  context: OrgContext,
  rawInput: ChangeSubcontractStatusInput,
): Promise<SubcontractDetail> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);
  const input = parseOrThrow(changeSubcontractStatusSchema.safeParse(rawInput));

  const agreementId = await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const existing = await findSubcontractAgreementByIdForUpdate(
      tx,
      context.organizationId,
      input.subcontractId,
    );
    if (!existing) throw new NotFoundError('Subcontract');
    if (existing.status === input.status) return existing.id;
    assertSubcontractStatusTransition(existing.status, input.status as SubcontractStatus);

    const updated = await updateSubcontractAgreementById(
      tx,
      context.organizationId,
      input.subcontractId,
      { status: input.status as SubcontractStatus },
      { fromStatuses: [existing.status] },
    );
    if (!updated) {
      throw new ConflictError('Subcontract was updated concurrently');
    }

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.SUBCONTRACT_STATUS_CHANGED,
      entityType: 'subcontract_agreement',
      entityId: updated.id,
      before: existing,
      after: updated,
    });

    return updated.id;
  });

  return loadDetail(context, agreementId);
}

/**
 * Approved subcontract change - INSERT a new value event. Never mutates original.
 * Pending statuses are not events and cannot change current.
 */
export async function addApprovedSubcontractChange(
  context: OrgContext,
  rawInput: AddSubcontractValueChangeInput,
): Promise<SubcontractDetail> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);
  const input = parseOrThrow(addSubcontractValueChangeSchema.safeParse(rawInput));

  const agreementId = await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const existing = await findSubcontractAgreementByIdForUpdate(
      tx,
      context.organizationId,
      input.subcontractId,
    );
    if (!existing) throw new NotFoundError('Subcontract');
    assertSubcontractAcceptsValueChange(existing.status);

    const events = await listSubcontractValueEvents(tx, context.organizationId, existing.id);
    const originalCount = events.filter((event) => event.kind === 'original').length;
    if (originalCount > 1) {
      throw new ConflictError('Original subcontract value already recorded');
    }

    const magnitude = money(input.amount, existing.currency);
    const signed = signedSubcontractChangeAmount(input.direction, magnitude);
    const effectiveDate =
      input.effectiveDate ?? todayInTimeZone(context.organization.timezone);

    await insertSubcontractValueEvent(tx, {
      organizationId: context.organizationId,
      subcontractId: existing.id,
      kind: input.kind,
      amount: toNumericString(signed),
      currency: existing.currency,
      effectiveDate,
      reason: input.reason ?? null,
      actorUserId: context.userId,
    });

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.SUBCONTRACT_VALUE_RECORDED,
      entityType: 'subcontract_agreement',
      entityId: existing.id,
      after: {
        kind: input.kind,
        amount: toNumericString(signed),
        direction: input.direction,
      },
    });

    return existing.id;
  });

  return loadDetail(context, agreementId);
}

export async function getSubcontractById(
  context: OrgContext,
  subcontractId: string,
): Promise<SubcontractDetail> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);
  return loadDetail(context, subcontractId);
}

export async function listVendorSubcontracts(
  context: OrgContext,
  vendorId: string,
): Promise<SubcontractListItem[]> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);
  const vendor = await findVendorById(context.db, context.organizationId, vendorId);
  if (!vendor) throw new NotFoundError('Vendor');
  const allowed = await resolveAccessibleProjectIds(context);
  const rows = await listSubcontractsForVendor(context.db, context.organizationId, vendorId);
  return rows.filter((row) => isAccessibleProjectId(allowed, row.projectId));
}

export async function listProjectSubcontracts(
  context: OrgContext,
  projectId: string,
): Promise<SubcontractListItem[]> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  await assertCanAccessProject(context, projectId);
  return listSubcontractsForProject(context.db, context.organizationId, projectId);
}

export async function listSubcontractParentContracts(
  context: OrgContext,
  projectId?: string,
): Promise<SubcontractParentContractOption[]> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);
  if (projectId) await assertCanAccessProject(context, projectId);
  return listParentContractOptions(context.db, context.organizationId, projectId);
}

export async function listSubcontractDocumentCandidates(
  context: OrgContext,
): Promise<{ id: string; originalFilename: string }[]> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);
  return listLinkableDocuments(context.db, context.organizationId);
}

/**
 * Links an existing document to the agreement (ownerType subcontract_agreement).
 * Required / insurance flags and expiry live on `documents`, not a new store.
 */
export async function linkSubcontractDocument(
  context: OrgContext,
  rawInput: LinkSubcontractDocumentInput,
): Promise<SubcontractDetail> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);
  const input = parseOrThrow(linkSubcontractDocumentSchema.safeParse(rawInput));

  const agreement = await findSubcontractAgreementById(
    context.db,
    context.organizationId,
    input.subcontractId,
  );
  if (!agreement) throw new NotFoundError('Subcontract');

  const document = await findDocumentInOrg(context.db, context.organizationId, input.documentId);
  if (!document || document.status === 'deleted') throw new NotFoundError('Document');

  const isInsurance = Boolean(input.isInsurance);
  const requiredType = isInsurance ? 'insurance' : (input.requiredType ?? null);
  const label = input.label ?? (isInsurance ? 'insurance' : null);

  try {
    await linkDocumentToEntity(context, {
      documentId: input.documentId,
      ownerType: 'subcontract_agreement',
      ownerId: agreement.id,
      label,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('Document is already linked to this subcontract');
    }
    throw error;
  }

  if (input.isRequired || isInsurance || input.expiresAt) {
    await updateDocumentRequirementFlags(context.db, context.organizationId, input.documentId, {
      isRequired: Boolean(input.isRequired || isInsurance),
      requiredType,
      expiresAt: input.expiresAt ?? null,
    });
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SUBCONTRACT_DOCUMENT_LINKED,
    entityType: 'subcontract_agreement',
    entityId: agreement.id,
    after: { documentId: input.documentId, requiredType, expiresAt: input.expiresAt ?? null },
  });

  return loadDetail(context, agreement.id);
}

export async function listOrgSubcontracts(
  context: OrgContext,
  rawFilters: ListOrgSubcontractsInput = {},
): Promise<SubcontractListItem[]> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);
  const input = parseOrThrow(listOrgSubcontractsSchema.safeParse(rawFilters));
  const allowed = await resolveAccessibleProjectIds(context);
  const rows = await listOrgSubcontractsRows(context.db, context.organizationId, {
    vendorId: input.vendorId,
    projectId: input.projectId,
    status: input.status,
    limit: input.limit,
  });
  return rows.filter((row) => isAccessibleProjectId(allowed, row.projectId));
}

/** Original amount is immutable after create - only append-only events change current. */
export function rejectSubcontractOriginalMutation(): never {
  throw new DomainRuleError(
    'Original subcontract amount cannot be updated; append an approved change event',
    'vendors.subcontracts.errors.originalImmutable',
  );
}
