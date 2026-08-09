import { recordAuditEvent } from '@/shared/audit';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { fromNumericString, toNumericString } from '@/shared/money/money';
import {
  changeOrderApprovedNetAmount,
  changeOrderEventAmount,
} from '../domain/contract-value';
import { canTransitionChangeRequest } from '../domain/change-request-lifecycle';
import { canIssueQuoteVersion } from '../domain/quote-version-rules';
import { COMMERCIAL_AUDIT_ACTIONS } from '../domain/types';
import { findChangeRequestById } from '../data/change-requests.repository';
import {
  findContractById,
  findPrimaryContractForProject,
  insertContractValueEvent,
} from '../data/contracts.repository';
import {
  findQuoteForChangeRequest,
  findQuoteVersionById,
  findQuoteVersionForChangeRequest,
  findSelectedQuoteVersionForChangeRequest,
  insertApproval,
  insertChangeOrderWithProjectReference,
  insertQuote,
  insertQuoteVersion,
  nextQuoteVersionNumber,
  replaceQuoteVersionLines,
  supersedeIssuedVersions,
  updateQuoteVersion,
} from '../data/quotes.repository';
import { updateChangeRequestFields } from '../data/change-requests.repository';
import {
  approveChangeRequestSchema,
  createQuoteVersionSchema,
  issueQuoteVersionSchema,
  type ApproveChangeRequestInput,
  type CreateQuoteVersionInput,
} from '../validation/schemas';
import { computeQuoteTotals } from './change-requests';

export async function createQuoteVersion(
  context: OrgContext,
  rawInput: CreateQuoteVersionInput,
): Promise<{ quoteVersionId: string; versionNumber: number }> {
  assertPermission(context, PERMISSIONS.CHANGES_MANAGE);

  const parsed = createQuoteVersionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const input = parsed.data;
  const changeRequest = await findChangeRequestById(
    context.db,
    context.organizationId,
    input.changeRequestId,
  );
  if (!changeRequest) throw new NotFoundError('Change request');
  assertSameOrganization(context, changeRequest, 'Change request');

  if (changeRequest.status === 'approved' || changeRequest.status === 'cancelled') {
    throw new DomainRuleError(
      'Cannot price a finalized change request',
      'changes.errors.cannotPrice',
    );
  }

  let quote = await findQuoteForChangeRequest(
    context.db,
    context.organizationId,
    changeRequest.id,
  );
  if (!quote) {
    quote = await insertQuote(context.db, {
      organizationId: context.organizationId,
      projectId: changeRequest.projectId,
      changeRequestId: changeRequest.id,
      title: changeRequest.title,
      currency: changeRequest.currency,
    });
  }

  const versionNumber = await nextQuoteVersionNumber(
    context.db,
    context.organizationId,
    quote.id,
  );

  const lines = input.lines.map((line, index) => ({
    ...line,
    currency: changeRequest.currency,
    sortOrder: index,
  }));

  const totals = computeQuoteTotals(lines, changeRequest.currency, input.taxAmount);

  const version = await insertQuoteVersion(context.db, {
    organizationId: context.organizationId,
    quoteId: quote.id,
    versionNumber,
    subtotalAmount: totals.subtotal,
    taxAmount: totals.tax,
    totalAmount: totals.total,
    currency: changeRequest.currency,
    validUntil: input.validUntil ?? null,
    notes: input.notes ?? null,
  });

  await replaceQuoteVersionLines(context.db, context.organizationId, version.id, lines);

  await recordAuditEvent(context, {
    action: COMMERCIAL_AUDIT_ACTIONS.QUOTE_VERSION_CREATED,
    entityType: 'quote_version',
    entityId: version.id,
    after: { versionNumber, totalAmount: totals.total },
  });

  return { quoteVersionId: version.id, versionNumber };
}

export async function issueQuoteVersion(
  context: OrgContext,
  rawInput: { quoteVersionId: string },
): Promise<void> {
  assertPermission(context, PERMISSIONS.CHANGES_MANAGE);

  const parsed = issueQuoteVersionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const version = await findQuoteVersionById(
    context.db,
    context.organizationId,
    parsed.data.quoteVersionId,
  );
  if (!version) throw new NotFoundError('Quote version');

  if (!canIssueQuoteVersion(version)) {
    throw new DomainRuleError(
      'Only draft quote versions can be issued',
      'changes.errors.quoteNotDraft',
    );
  }

  const issuedAt = new Date();
  await supersedeIssuedVersions(context.db, context.organizationId, version.quoteId, version.id);

  await updateQuoteVersion(context.db, context.organizationId, version.id, {
    status: 'issued',
    issuedAt,
    isSelected: true,
  });

  await recordAuditEvent(context, {
    action: COMMERCIAL_AUDIT_ACTIONS.QUOTE_VERSION_ISSUED,
    entityType: 'quote_version',
    entityId: version.id,
    after: { status: 'issued', issuedAt: issuedAt.toISOString() },
  });
}

export interface ApproveChangeRequestResult {
  readonly changeOrderId: string;
  readonly reference: string;
}

/**
 * Approval creates internal evidence and an immutable change order that writes
 * the sole contract value event (doc 05 §6).
 */
export async function approveChangeRequest(
  context: OrgContext,
  rawInput: ApproveChangeRequestInput,
): Promise<ApproveChangeRequestResult> {
  assertPermission(context, PERMISSIONS.CHANGES_APPROVE);

  const parsed = approveChangeRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const input = parsed.data;
  const changeRequest = await findChangeRequestById(
    context.db,
    context.organizationId,
    input.changeRequestId,
  );
  if (!changeRequest) throw new NotFoundError('Change request');
  assertSameOrganization(context, changeRequest, 'Change request');

  if (!canTransitionChangeRequest(changeRequest.status, 'approved')) {
    throw new DomainRuleError(
      `Cannot approve change request in status ${changeRequest.status}`,
      'changes.errors.notDraft',
    );
  }

  const contract =
    (changeRequest.contractId
      ? await findContractById(context.db, context.organizationId, changeRequest.contractId)
      : null) ??
    (await findPrimaryContractForProject(
      context.db,
      context.organizationId,
      changeRequest.projectId,
    ));

  if (!contract) {
    throw new DomainRuleError(
      'A primary contract is required before approving a change',
      'changes.errors.noContract',
    );
  }

  const quoteVersion = input.quoteVersionId
    ? await findQuoteVersionForChangeRequest(
        context.db,
        context.organizationId,
        changeRequest.id,
        input.quoteVersionId,
      )
    : await findSelectedQuoteVersionForChangeRequest(
        context.db,
        context.organizationId,
        changeRequest.id,
      );

  if (input.quoteVersionId && !quoteVersion) {
    throw new NotFoundError('Quote version');
  }

  if (quoteVersion) {
    if (quoteVersion.status !== 'issued' && quoteVersion.status !== 'accepted') {
      throw new DomainRuleError(
        'Approval requires an issued quote version',
        'changes.errors.quoteNotIssued',
      );
    }
  }

  // VAT ≠ profit: contract value events use quote net (subtotal), never tax-inclusive total.
  const approvedAmount = changeOrderApprovedNetAmount({
    quoteVersion,
    requestedAmount: changeRequest.requestedAmount,
  });
  if (!approvedAmount) {
    throw new DomainRuleError(
      'Approval requires a priced quote or requested amount',
      'changes.errors.noAmount',
    );
  }

  const effectiveDate = input.effectiveDate
    ? businessDate(input.effectiveDate)
    : todayInTimeZone(context.organization.timezone);

  const decidedAt = new Date();
  const approvalId = await insertApproval(context.db, {
    organizationId: context.organizationId,
    targetType: 'change_request',
    targetId: changeRequest.id,
    decision: 'approved',
    approverName: input.approverName ?? null,
    recordedByUserId: context.userId,
    decidedAt,
    notes: input.notes ?? null,
  });

  const changeOrder = await insertChangeOrderWithProjectReference(
    context.db,
    {
      organizationId: context.organizationId,
      projectId: changeRequest.projectId,
      contractId: contract.id,
      changeRequestId: changeRequest.id,
      quoteVersionId: quoteVersion?.id ?? null,
      approvalId,
      direction: changeRequest.direction,
      amount: approvedAmount,
      currency: changeRequest.currency,
      effectiveDate,
      notes: input.notes ?? null,
    },
    context.organizationId,
    changeRequest.projectId,
  );

  if (!changeOrder.reference) {
    throw new DomainRuleError(
      'Change order reference missing after insert',
      'changes.errors.referenceConflict',
    );
  }

  const reference = changeOrder.reference;

  const magnitude = fromNumericString(approvedAmount, changeRequest.currency);
  if (!magnitude) {
    throw new DomainRuleError('Invalid approved amount', 'changes.errors.noAmount');
  }

  const signedEventAmount = changeOrderEventAmount(changeRequest.direction, magnitude);

  await insertContractValueEvent(context.db, {
    organizationId: context.organizationId,
    contractId: contract.id,
    projectId: changeRequest.projectId,
    kind: 'change_order',
    amount: toNumericString(signedEventAmount),
    currency: changeRequest.currency,
    changeOrderId: changeOrder.id,
    effectiveDate,
    reason: `Change order ${reference}`,
    actorUserId: context.userId,
  });

  if (quoteVersion) {
    await updateQuoteVersion(context.db, context.organizationId, quoteVersion.id, {
      status: 'accepted',
      isSelected: true,
    });
  }

  await updateChangeRequestFields(context.db, context.organizationId, changeRequest.id, {
    status: 'approved',
    decidedAt,
    contractId: contract.id,
  });

  await recordAuditEvent(context, {
    action: COMMERCIAL_AUDIT_ACTIONS.CHANGE_REQUEST_APPROVED,
    entityType: 'change_request',
    entityId: changeRequest.id,
    after: { status: 'approved', changeOrderId: changeOrder.id },
  });

  await recordAuditEvent(context, {
    action: COMMERCIAL_AUDIT_ACTIONS.CHANGE_ORDER_CREATED,
    entityType: 'change_order',
    entityId: changeOrder.id,
    after: changeOrder,
  });

  return { changeOrderId: changeOrder.id, reference };
}

/** Guard for application-layer immutability of issued quote versions. */
export async function assertQuoteVersionEditable(
  context: OrgContext,
  quoteVersionId: string,
): Promise<void> {
  const version = await findQuoteVersionById(context.db, context.organizationId, quoteVersionId);
  if (!version) throw new NotFoundError('Quote version');

  if (version.status !== 'draft') {
    throw new DomainRuleError(
      'Issued quote versions are immutable; create a new version instead',
      'changes.errors.quoteImmutable',
    );
  }
}

export async function updateDraftQuoteVersion(
  context: OrgContext,
  input: CreateQuoteVersionInput & { quoteVersionId: string },
): Promise<void> {
  assertPermission(context, PERMISSIONS.CHANGES_MANAGE);

  const changeRequest = await findChangeRequestById(
    context.db,
    context.organizationId,
    input.changeRequestId,
  );
  if (!changeRequest) throw new NotFoundError('Change request');

  const version = await findQuoteVersionForChangeRequest(
    context.db,
    context.organizationId,
    changeRequest.id,
    input.quoteVersionId,
  );
  if (!version) throw new NotFoundError('Quote version');

  if (version.status !== 'draft') {
    throw new DomainRuleError(
      'Issued quote versions are immutable; create a new version instead',
      'changes.errors.quoteImmutable',
    );
  }

  const lines = input.lines.map((line, index) => ({
    ...line,
    currency: changeRequest.currency,
    sortOrder: index,
  }));
  const totals = computeQuoteTotals(lines, changeRequest.currency, input.taxAmount);

  await updateQuoteVersion(context.db, context.organizationId, version.id, {
    subtotalAmount: totals.subtotal,
    taxAmount: totals.tax,
    totalAmount: totals.total,
    validUntil: input.validUntil ?? null,
    notes: input.notes ?? null,
  });

  await replaceQuoteVersionLines(context.db, context.organizationId, version.id, lines);
}
