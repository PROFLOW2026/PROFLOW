import { recordAuditEvent } from '@/shared/audit';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money, sumMoney, toNumericString, zeroMoney } from '@/shared/money/money';
import { noteModuleUsage } from '@/modules/tenancy';
import { canTransitionChangeRequest } from '../domain/change-request-lifecycle';
import { COMMERCIAL_AUDIT_ACTIONS } from '../domain/types';
import {
  findChangeRequestById,
  insertChangeRequest,
  nextChangeRequestReference,
  updateChangeRequestFields,
} from '../data/change-requests.repository';
import { findPrimaryContractForProject } from '../data/contracts.repository';
import { createChangeRequestSchema, type CreateChangeRequestInput } from '../validation/schemas';

export interface CreateChangeRequestResult {
  readonly changeRequestId: string;
  readonly reference: string;
}

export async function createChangeRequest(
  context: OrgContext,
  rawInput: CreateChangeRequestInput,
): Promise<CreateChangeRequestResult> {
  assertPermission(context, PERMISSIONS.CHANGES_MANAGE);

  const parsed = createChangeRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const input = parsed.data;
  const contract = await findPrimaryContractForProject(
    context.db,
    context.organizationId,
    input.projectId,
  );

  const currency = contract?.currency ?? context.organization.baseCurrency;
  const reference = await nextChangeRequestReference(
    context.db,
    context.organizationId,
    input.projectId,
  );

  const changeRequest = await insertChangeRequest(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    contractId: contract?.id ?? null,
    reference,
    title: input.title,
    description: input.description ?? null,
    direction: input.direction,
    requestedAmount: input.requestedAmount ?? null,
    currency,
    requestedDate: input.requestedDate ?? null,
    createdByUserId: context.userId,
    notes: input.notes ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'changes');

  await recordAuditEvent(context, {
    action: COMMERCIAL_AUDIT_ACTIONS.CHANGE_REQUEST_CREATED,
    entityType: 'change_request',
    entityId: changeRequest.id,
    after: changeRequest,
  });

  return { changeRequestId: changeRequest.id, reference };
}

export async function updateChangeRequest(
  context: OrgContext,
  rawInput: {
    changeRequestId: string;
    title?: string;
    description?: string | null;
    direction?: CreateChangeRequestInput['direction'];
    requestedAmount?: string | null;
    requestedDate?: string | null;
    notes?: string | null;
  },
): Promise<void> {
  assertPermission(context, PERMISSIONS.CHANGES_MANAGE);

  const existing = await findChangeRequestById(
    context.db,
    context.organizationId,
    rawInput.changeRequestId,
  );
  if (!existing) throw new NotFoundError('Change request');
  assertSameOrganization(context, existing, 'Change request');

  if (existing.status !== 'draft') {
    throw new DomainRuleError(
      'Only draft change requests can be edited',
      'changes.errors.notDraft',
    );
  }

  const updated = await updateChangeRequestFields(
    context.db,
    context.organizationId,
    rawInput.changeRequestId,
    {
      title: rawInput.title,
      description: rawInput.description,
      direction: rawInput.direction,
      requestedAmount: rawInput.requestedAmount,
      requestedDate: rawInput.requestedDate,
      notes: rawInput.notes,
    },
  );

  await recordAuditEvent(context, {
    action: COMMERCIAL_AUDIT_ACTIONS.CHANGE_REQUEST_UPDATED,
    entityType: 'change_request',
    entityId: rawInput.changeRequestId,
    before: existing,
    after: updated,
  });
}

export async function submitChangeRequestForApproval(
  context: OrgContext,
  changeRequestId: string,
  options: { recordSent?: boolean } = {},
): Promise<void> {
  assertPermission(context, PERMISSIONS.CHANGES_MANAGE);

  const existing = await findChangeRequestById(context.db, context.organizationId, changeRequestId);
  if (!existing) throw new NotFoundError('Change request');
  assertSameOrganization(context, existing, 'Change request');

  if (!canTransitionChangeRequest(existing.status, 'awaiting_approval')) {
    throw new DomainRuleError(
      `Cannot transition from ${existing.status} to awaiting_approval`,
      'changes.errors.notDraft',
    );
  }

  await updateChangeRequestFields(context.db, context.organizationId, changeRequestId, {
    status: 'awaiting_approval',
    sentAt: options.recordSent ? new Date() : existing.sentAt,
  });

  await recordAuditEvent(context, {
    action: options.recordSent
      ? COMMERCIAL_AUDIT_ACTIONS.CHANGE_REQUEST_SENT
      : COMMERCIAL_AUDIT_ACTIONS.CHANGE_REQUEST_SUBMITTED,
    entityType: 'change_request',
    entityId: changeRequestId,
    before: { status: existing.status },
    after: { status: 'awaiting_approval', sentAt: options.recordSent ? new Date().toISOString() : null },
  });
}

export async function rejectChangeRequest(
  context: OrgContext,
  changeRequestId: string,
  notes?: string | null,
): Promise<void> {
  assertPermission(context, PERMISSIONS.CHANGES_MANAGE);

  const existing = await findChangeRequestById(context.db, context.organizationId, changeRequestId);
  if (!existing) throw new NotFoundError('Change request');

  if (!canTransitionChangeRequest(existing.status, 'rejected')) {
    throw new DomainRuleError('Cannot reject this change request', 'changes.errors.notDraft');
  }

  await updateChangeRequestFields(context.db, context.organizationId, changeRequestId, {
    status: 'rejected',
    decidedAt: new Date(),
    notes: notes ?? existing.notes,
  });

  await recordAuditEvent(context, {
    action: COMMERCIAL_AUDIT_ACTIONS.CHANGE_REQUEST_REJECTED,
    entityType: 'change_request',
    entityId: changeRequestId,
    before: { status: existing.status },
    after: { status: 'rejected' },
  });
}

export async function cancelChangeRequest(
  context: OrgContext,
  changeRequestId: string,
  notes?: string | null,
): Promise<void> {
  assertPermission(context, PERMISSIONS.CHANGES_MANAGE);

  const existing = await findChangeRequestById(context.db, context.organizationId, changeRequestId);
  if (!existing) throw new NotFoundError('Change request');

  if (!canTransitionChangeRequest(existing.status, 'cancelled')) {
    throw new DomainRuleError('Cannot cancel this change request', 'changes.errors.notDraft');
  }

  await updateChangeRequestFields(context.db, context.organizationId, changeRequestId, {
    status: 'cancelled',
    cancelledAt: new Date(),
    notes: notes ?? existing.notes,
  });

  await recordAuditEvent(context, {
    action: COMMERCIAL_AUDIT_ACTIONS.CHANGE_REQUEST_CANCELLED,
    entityType: 'change_request',
    entityId: changeRequestId,
    before: { status: existing.status },
    after: { status: 'cancelled' },
  });
}

/** Computes line totals for quote version creation. */
export function computeQuoteTotals(
  lines: readonly { lineTotal: string; currency: string }[],
  currency: string,
  taxAmount: string | null | undefined,
): { subtotal: string; tax: string | null; total: string } {
  const lineValues = lines.map((line) => money(line.lineTotal, line.currency));
  const subtotal = sumMoney(lineValues, currency);
  const tax = taxAmount ? money(taxAmount, currency) : zeroMoney(currency);
  const total = taxAmount ? sumMoney([subtotal, tax], currency) : subtotal;

  return {
    subtotal: toNumericString(subtotal),
    tax: taxAmount ? toNumericString(tax) : null,
    total: toNumericString(total),
  };
}
