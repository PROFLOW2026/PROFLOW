import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  assertAcceptMatchDoesNotCreateExpense,
  assertMatchCurrencyIntegrity,
  assertMatchDoesNotOverMatch,
  assertMatchHasTarget,
  deriveBillStatusFromAcceptedMatches,
  isAcceptingMatchCreatingExpense,
  type ApBillStatus,
} from '../domain/matching';
import {
  findApBillById,
  findApPoMatchById,
  findExpenseInOrg,
  findPurchaseOrderInOrg,
  insertApPoMatch,
  listAcceptedMatchAmountsForBill,
  listReservedMatchAmountsForBill,
  updateApBillStatus,
  updateApPoMatchStatus,
  type ApPoMatchRow,
} from '../data/ap.repository';
import {
  decideApMatchSchema,
  proposeApMatchSchema,
  type DecideApMatchInput,
  type ProposeApMatchInput,
} from '../validation/schemas';

async function refreshBillMatchStatus(
  context: OrgContext,
  billId: string,
  currentStatus: ApBillStatus,
  currency: string,
  billTotal: string,
): Promise<void> {
  const accepted = await listAcceptedMatchAmountsForBill(
    context.db,
    context.organizationId,
    billId,
  );
  const next = deriveBillStatusFromAcceptedMatches({
    currency,
    billTotal,
    acceptedMatchedAmounts: accepted,
    currentStatus,
  });
  if (next !== currentStatus) {
    await updateApBillStatus(context.db, context.organizationId, billId, next);
  }
}

/**
 * Propose a match from an AP bill to a PO and/or an existing expense.
 * Supports partial matching (multiple matches per bill). Does not create expenses.
 */
export async function proposeApMatch(
  context: OrgContext,
  raw: ProposeApMatchInput,
): Promise<ApPoMatchRow> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);

  const parsed = proposeApMatchSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  assertMatchHasTarget({
    purchaseOrderId: input.purchaseOrderId,
    expenseId: input.expenseId,
  });

  const bill = await findApBillById(context.db, context.organizationId, input.apBillId);
  if (!bill || bill.archivedAt) throw new NotFoundError('AP bill');
  if (bill.status === 'void') {
    throw new DomainRuleError('Cannot match a void bill', 'ap.errors.billVoid');
  }

  let purchaseOrderCurrency: string | null = null;
  if (input.purchaseOrderId) {
    const po = await findPurchaseOrderInOrg(
      context.db,
      context.organizationId,
      input.purchaseOrderId,
    );
    if (!po) throw new NotFoundError('Purchase order');
    if (po.vendorId !== bill.vendorId) {
      throw new DomainRuleError(
        'Purchase order vendor must match the bill vendor',
        'ap.errors.vendorMismatch',
      );
    }
    purchaseOrderCurrency = po.currency;
  }

  let expenseCurrency: string | null = null;
  if (input.expenseId) {
    const expense = await findExpenseInOrg(context.db, context.organizationId, input.expenseId);
    if (!expense) throw new NotFoundError('Expense');
    if (expense.vendorId && expense.vendorId !== bill.vendorId) {
      throw new DomainRuleError(
        'Expense vendor must match the bill vendor',
        'ap.errors.vendorMismatch',
      );
    }
    expenseCurrency = expense.currency;
  }

  assertMatchCurrencyIntegrity({
    billCurrency: bill.currency,
    matchCurrency: input.currency,
    purchaseOrderCurrency,
    expenseCurrency,
  });

  const reserved = await listReservedMatchAmountsForBill(
    context.db,
    context.organizationId,
    bill.id,
  );
  assertMatchDoesNotOverMatch({
    currency: bill.currency,
    billTotal: bill.totalAmount,
    reservedMatchedAmounts: reserved,
    additionalMatchedAmount: input.matchedAmount,
  });

  const match = await insertApPoMatch(context.db, {
    organizationId: context.organizationId,
    apBillId: bill.id,
    purchaseOrderId: input.purchaseOrderId ?? null,
    expenseId: input.expenseId ?? null,
    matchedAmount: input.matchedAmount,
    currency: input.currency.toUpperCase(),
    status: 'proposed',
    notes: input.notes ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'procurement');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_MATCH_PROPOSED,
    entityType: 'ap_po_match',
    entityId: match.id,
    after: {
      apBillId: match.apBillId,
      purchaseOrderId: match.purchaseOrderId,
      expenseId: match.expenseId,
      matchedAmount: match.matchedAmount,
      expenseCreated: false,
    },
  });

  return match;
}

/**
 * Accept a proposed match. Updates match + bill status only.
 * NEVER creates an Expense. AP bill != Expense; matching links existing truth.
 */
export async function acceptApMatch(
  context: OrgContext,
  raw: DecideApMatchInput,
): Promise<ApPoMatchRow> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);

  const parsed = decideApMatchSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  assertAcceptMatchDoesNotCreateExpense();

  const existing = await findApPoMatchById(
    context.db,
    context.organizationId,
    parsed.data.matchId,
  );
  if (!existing) throw new NotFoundError('AP match');
  if (existing.status !== 'proposed') {
    throw new DomainRuleError('Only proposed matches can be accepted', 'ap.errors.matchNotProposed');
  }

  assertMatchHasTarget({
    purchaseOrderId: existing.purchaseOrderId,
    expenseId: existing.expenseId,
  });

  const bill = await findApBillById(context.db, context.organizationId, existing.apBillId);
  if (!bill || bill.archivedAt) throw new NotFoundError('AP bill');

  // Capacity vs other accepted matches only (this proposed row is not yet accepted).
  const otherAccepted = await listAcceptedMatchAmountsForBill(
    context.db,
    context.organizationId,
    bill.id,
  );
  assertMatchDoesNotOverMatch({
    currency: bill.currency,
    billTotal: bill.totalAmount,
    reservedMatchedAmounts: otherAccepted,
    additionalMatchedAmount: existing.matchedAmount,
  });

  const accepted = await updateApPoMatchStatus(
    context.db,
    context.organizationId,
    existing.id,
    'accepted',
  );
  if (!accepted) throw new NotFoundError('AP match');

  // Domain guard: acceptance must not invent expense rows.
  assertAcceptMatchDoesNotCreateExpense();

  await refreshBillMatchStatus(
    context,
    bill.id,
    bill.status as ApBillStatus,
    bill.currency,
    bill.totalAmount,
  );

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_MATCH_ACCEPTED,
    entityType: 'ap_po_match',
    entityId: accepted.id,
    before: { status: existing.status },
    after: {
      status: accepted.status,
      expenseId: accepted.expenseId,
      purchaseOrderId: accepted.purchaseOrderId,
      expenseCreated: isAcceptingMatchCreatingExpense(),
    },
  });

  return accepted;
}

export async function rejectApMatch(
  context: OrgContext,
  raw: DecideApMatchInput,
): Promise<ApPoMatchRow> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);

  const parsed = decideApMatchSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findApPoMatchById(
    context.db,
    context.organizationId,
    parsed.data.matchId,
  );
  if (!existing) throw new NotFoundError('AP match');
  if (existing.status !== 'proposed') {
    throw new DomainRuleError('Only proposed matches can be rejected', 'ap.errors.matchNotProposed');
  }

  const rejected = await updateApPoMatchStatus(
    context.db,
    context.organizationId,
    existing.id,
    'rejected',
  );
  if (!rejected) throw new NotFoundError('AP match');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_MATCH_REJECTED,
    entityType: 'ap_po_match',
    entityId: rejected.id,
    before: { status: existing.status },
    after: { status: rejected.status, expenseCreated: false },
  });

  return rejected;
}
