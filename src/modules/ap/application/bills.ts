import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { addMoney, money, moneyEquals, zeroMoney } from '@/shared/money';
import { findProjectById } from '@/modules/projects';
import {
  computeCommittedAfterConsumption,
  findOpenCommittedCostForPo,
  updateCommittedCostConsumption,
} from '@/modules/procurement';
import {
  computeMatchVariance,
  remainingUnmatchedAmount,
  type MatchVariance,
} from '../domain/matching';
import { consumeAmountForPostedPoBill } from '../domain/vendor-cost-recognition';
import {
  assertVendorInOrganization,
  findApBillById,
  findPurchaseOrderInOrg,
  findPurchaseOrderLineInOrg,
  insertApBill,
  insertApBillLines,
  listAcceptedMatchAmountsForBill,
  listApBillLines,
  listApBills,
  listApPoMatchesForBill,
  listReservedMatchAmountsForBill,
  type ApBillListItem,
  type ApBillLineRow,
  type ApBillRow,
  type ApPoMatchRow,
} from '../data/ap.repository';
import { createApBillSchema, type CreateApBillInput } from '../validation/schemas';

function assertBillTotalMatchesLines(input: {
  readonly currency: string;
  readonly totalAmount: string;
  readonly lines: readonly { readonly lineTotal: string; readonly currency: string }[];
}): void {
  const currency = input.currency.toUpperCase();
  let sum = zeroMoney(currency);
  for (const line of input.lines) {
    if (line.currency.toUpperCase() !== currency) {
      throw new DomainRuleError(
        'AP bill line currency must match the bill currency',
        'ap.errors.currencyMismatch',
      );
    }
    sum = addMoney(sum, money(line.lineTotal, currency));
  }
  if (!moneyEquals(sum, money(input.totalAmount, currency))) {
    throw new DomainRuleError(
      'Bill total must equal the sum of line totals',
      'ap.errors.totalMismatch',
    );
  }
}

export async function listApBillsForOrg(
  context: OrgContext,
  options: { readonly limit?: number; readonly offset?: number } = {},
): Promise<ApBillListItem[]> {
  assertPermission(context, PERMISSIONS.AP_READ);
  return listApBills(context.db, context.organizationId, options);
}

export async function getApBillDetail(
  context: OrgContext,
  billId: string,
): Promise<{
  bill: ApBillRow;
  lines: ApBillLineRow[];
  matches: ApPoMatchRow[];
  matchPosition: MatchVariance & { remainingIncludingProposed: string };
} | null> {
  assertPermission(context, PERMISSIONS.AP_READ);
  const bill = await findApBillById(context.db, context.organizationId, billId);
  if (!bill || bill.archivedAt) return null;

  const [lines, matches, acceptedAmounts, reservedAmounts] = await Promise.all([
    listApBillLines(context.db, context.organizationId, bill.id),
    listApPoMatchesForBill(context.db, context.organizationId, bill.id),
    listAcceptedMatchAmountsForBill(context.db, context.organizationId, bill.id),
    listReservedMatchAmountsForBill(context.db, context.organizationId, bill.id),
  ]);

  const variance = computeMatchVariance({
    currency: bill.currency,
    billTotal: bill.totalAmount,
    acceptedMatchedAmounts: acceptedAmounts,
  });

  const remainingIncludingProposed = remainingUnmatchedAmount({
    currency: bill.currency,
    billTotal: bill.totalAmount,
    reservedMatchedAmounts: reservedAmounts,
  });

  return {
    bill,
    lines,
    matches,
    matchPosition: {
      ...variance,
      remainingIncludingProposed: remainingIncludingProposed.amount,
    },
  };
}

/**
 * Creates a posted AP bill (status open). Does NOT create an Expense row.
 * Posted bills recognize Actual Vendor Cost in financials; payments remain cash-only.
 * When linked to a PO, consumes commitment by the bill total so Actual+Commitment
 * do not double-count before match accept.
 */
export async function createApBill(context: OrgContext, raw: CreateApBillInput) {
  assertPermission(context, PERMISSIONS.AP_MANAGE);

  const parsed = createApBillSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  assertBillTotalMatchesLines({
    currency: input.currency,
    totalAmount: input.totalAmount,
    lines: input.lines,
  });

  const vendorOk = await assertVendorInOrganization(
    context.db,
    context.organizationId,
    input.vendorId,
  );
  if (!vendorOk) throw new NotFoundError('Vendor');

  let projectId = input.projectId ?? null;
  const purchaseOrderId = input.purchaseOrderId ?? null;

  if (purchaseOrderId) {
    const po = await findPurchaseOrderInOrg(
      context.db,
      context.organizationId,
      purchaseOrderId,
    );
    if (!po) throw new NotFoundError('Purchase order');
    if (po.vendorId !== input.vendorId) {
      throw new DomainRuleError(
        'Purchase order vendor must match the bill vendor',
        'ap.errors.vendorMismatch',
      );
    }
    if (po.currency.toUpperCase() !== input.currency.toUpperCase()) {
      throw new DomainRuleError(
        'Purchase order currency must match the bill currency',
        'ap.errors.currencyMismatch',
      );
    }
    // Inherit project from PO when omitted so recognition lands on project financials.
    if (!projectId && po.projectId) {
      projectId = po.projectId;
    }
  }

  if (projectId) {
    const project = await findProjectById(context.db, context.organizationId, projectId);
    if (!project || project.archivedAt) throw new NotFoundError('Project');
  }

  for (const line of input.lines) {
    if (!line.purchaseOrderLineId) continue;
    const poLine = await findPurchaseOrderLineInOrg(
      context.db,
      context.organizationId,
      line.purchaseOrderLineId,
    );
    if (!poLine) throw new NotFoundError('Purchase order line');
    if (purchaseOrderId && poLine.purchaseOrderId !== purchaseOrderId) {
      throw new DomainRuleError(
        'Bill line purchase order line must belong to the selected purchase order',
        'ap.errors.poLineMismatch',
      );
    }
    const linePo = await findPurchaseOrderInOrg(
      context.db,
      context.organizationId,
      poLine.purchaseOrderId,
    );
    if (!linePo) throw new NotFoundError('Purchase order');
    if (linePo.vendorId !== input.vendorId) {
      throw new DomainRuleError(
        'Purchase order line vendor must match the bill vendor',
        'ap.errors.vendorMismatch',
      );
    }
    if (poLine.currency.toUpperCase() !== input.currency.toUpperCase()) {
      throw new DomainRuleError(
        'Purchase order line currency must match the bill currency',
        'ap.errors.currencyMismatch',
      );
    }
  }

  const bill = await insertApBill(context.db, {
    organizationId: context.organizationId,
    vendorId: input.vendorId,
    projectId,
    purchaseOrderId,
    reference: input.reference ?? null,
    status: 'open',
    billDate: input.billDate ?? null,
    dueDate: input.dueDate ?? null,
    currency: input.currency.toUpperCase(),
    totalAmount: input.totalAmount,
    notes: input.notes ?? null,
  });

  await insertApBillLines(
    context.db,
    input.lines.map((line, index) => ({
      organizationId: context.organizationId,
      apBillId: bill.id,
      description: line.description,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      lineTotal: line.lineTotal,
      currency: line.currency.toUpperCase(),
      purchaseOrderLineId: line.purchaseOrderLineId ?? null,
      sortOrder: index,
    })),
  );

  // Posted PO-linked bill → consume commitment by bill total (Actual recognition path).
  if (purchaseOrderId) {
    const openCommitted = await findOpenCommittedCostForPo(
      context.db,
      context.organizationId,
      purchaseOrderId,
    );
    if (openCommitted) {
      const { consumeAmount } = consumeAmountForPostedPoBill({
        openCommitmentAmount: openCommitted.amount,
        billTotal: bill.totalAmount,
        currency: openCommitted.currency,
      });
      const next = computeCommittedAfterConsumption({
        openAmount: openCommitted.amount,
        consumeAmount,
        currency: openCommitted.currency,
      });
      await updateCommittedCostConsumption(context.db, context.organizationId, openCommitted.id, {
        amount: next.remainingAmount,
        status: next.status,
      });
    }
  }

  await noteModuleUsage(context.db, context.organizationId, 'procurement');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_BILL_CREATED,
    entityType: 'ap_bill',
    entityId: bill.id,
    after: {
      id: bill.id,
      status: bill.status,
      totalAmount: bill.totalAmount,
      expenseCreated: false,
      recognizedVendorActual: true,
    },
  });

  return bill;
}
