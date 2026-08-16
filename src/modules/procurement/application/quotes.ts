import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { addMoney, money, moneyEquals, toNumericString, zeroMoney } from '@/shared/money';
import {
  assertVendorInOrganization,
  findProcurementRfqById,
  findSupplierQuoteById,
  insertSupplierQuote,
  insertSupplierQuoteLines,
  listSupplierQuoteLines,
  listSupplierQuotesForRfq,
  updateSupplierQuoteStatus,
} from '../data/procurement.repository';
import {
  buildPurchaseOrderInputFromAcceptedQuote,
  compareSupplierQuotesByTotal,
} from '../domain/quote-comparison';
import {
  createPurchaseOrderFromQuoteSchema,
  createSupplierQuoteSchema,
  updateSupplierQuoteStatusSchema,
  type CreateSupplierQuoteInput,
} from '../validation/schemas';
import { createPurchaseOrder } from './purchase-orders';
import { assertOptionalProjectRefsInOrg } from './assert-project-refs';

function assertQuoteTotalMatchesLines(input: {
  readonly currency: string;
  readonly totalAmount: string;
  readonly lines: readonly { readonly lineTotal: string; readonly currency: string }[];
}): void {
  const currency = input.currency.toUpperCase();
  let sum = zeroMoney(currency);
  for (const line of input.lines) {
    if (line.currency.toUpperCase() !== currency) {
      throw new DomainRuleError(
        'Supplier quote line currency must match the quote currency',
        'procurement.errors.currencyMismatch',
      );
    }
    sum = addMoney(sum, money(line.lineTotal, currency));
  }
  if (!moneyEquals(sum, money(input.totalAmount, currency))) {
    throw new DomainRuleError(
      'Quote total must equal the sum of line totals',
      'procurement.errors.quoteTotalMismatch',
    );
  }
}

export async function listQuotesForRfq(context: OrgContext, rfqId: string) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_READ);

  const rfq = await findProcurementRfqById(context.db, context.organizationId, rfqId);
  if (!rfq || rfq.archivedAt) throw new NotFoundError('RFQ');

  return listSupplierQuotesForRfq(context.db, context.organizationId, rfqId);
}

export async function getQuoteComparisonForRfq(context: OrgContext, rfqId: string) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_READ);

  const quotes = await listQuotesForRfq(context, rfqId);
  const withLineSums = await Promise.all(
    quotes.map(async (quote) => {
      const lines = await listSupplierQuoteLines(context.db, context.organizationId, quote.id);
      const currency = quote.currency.toUpperCase();
      let sum = zeroMoney(currency);
      for (const line of lines) {
        sum = addMoney(sum, money(line.lineTotal, currency));
      }
      return {
        quoteId: quote.id,
        vendorId: quote.vendorId,
        vendorName: quote.vendorName ?? quote.vendorId,
        currency: quote.currency,
        totalAmount: quote.totalAmount,
        status: quote.status,
        lineTotalSum: toNumericString(sum),
      };
    }),
  );

  return compareSupplierQuotesByTotal(withLineSums);
}

export async function createSupplierQuote(context: OrgContext, raw: CreateSupplierQuoteInput) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_MANAGE);

  const parsed = createSupplierQuoteSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const vendorOk = await assertVendorInOrganization(
    context.db,
    context.organizationId,
    input.vendorId,
  );
  if (!vendorOk) throw new NotFoundError('Vendor');

  let projectId = input.projectId ?? null;
  if (input.rfqId) {
    const rfq = await findProcurementRfqById(context.db, context.organizationId, input.rfqId);
    if (!rfq || rfq.archivedAt) throw new NotFoundError('RFQ');
    if (!projectId) projectId = rfq.projectId;
  }

  await assertOptionalProjectRefsInOrg(context, { projectId });

  const currency = input.currency.toUpperCase();
  let sum = zeroMoney(currency);
  for (const line of input.lines) {
    sum = addMoney(sum, money(line.lineTotal, currency));
  }
  const totalAmount = toNumericString(sum);
  assertQuoteTotalMatchesLines({
    currency,
    totalAmount,
    lines: input.lines,
  });

  const quote = await insertSupplierQuote(context.db, {
    organizationId: context.organizationId,
    rfqId: input.rfqId ?? null,
    vendorId: input.vendorId,
    projectId,
    status: 'received',
    currency,
    totalAmount,
    receivedOn: input.receivedOn ?? null,
    notes: input.notes ?? null,
  });

  await insertSupplierQuoteLines(
    context.db,
    input.lines.map((line, index) => ({
      organizationId: context.organizationId,
      supplierQuoteId: quote.id,
      description: line.description,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      lineTotal: line.lineTotal,
      currency: line.currency.toUpperCase(),
      sortOrder: index,
    })),
  );

  await noteModuleUsage(context.db, context.organizationId, 'procurement');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SUPPLIER_QUOTE_CREATED,
    entityType: 'supplier_quote',
    entityId: quote.id,
    after: { id: quote.id, vendorId: quote.vendorId, totalAmount: quote.totalAmount },
  });

  return quote;
}

export async function setSupplierQuoteStatus(
  context: OrgContext,
  raw: { quoteId: string; status: string },
) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_MANAGE);

  const parsed = updateSupplierQuoteStatusSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findSupplierQuoteById(
    context.db,
    context.organizationId,
    parsed.data.quoteId,
  );
  if (!existing || existing.archivedAt) throw new NotFoundError('Supplier quote');

  const updated = await updateSupplierQuoteStatus(
    context.db,
    context.organizationId,
    existing.id,
    parsed.data.status,
  );
  if (!updated) throw new NotFoundError('Supplier quote');

  await noteModuleUsage(context.db, context.organizationId, 'procurement');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SUPPLIER_QUOTE_STATUS_UPDATED,
    entityType: 'supplier_quote',
    entityId: updated.id,
    before: { status: existing.status },
    after: { status: updated.status },
  });

  return updated;
}

/**
 * Accept quote (if needed) then create a draft PO via createPurchaseOrder.
 * Issuing later creates committed_costs only - never Expense.
 */
export async function createPurchaseOrderFromAcceptedQuote(
  context: OrgContext,
  raw: { quoteId: string; reference?: string; orderedOn?: string; notes?: string },
) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_MANAGE);

  const parsed = createPurchaseOrderFromQuoteSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  let quote = await findSupplierQuoteById(
    context.db,
    context.organizationId,
    parsed.data.quoteId,
  );
  if (!quote || quote.archivedAt) throw new NotFoundError('Supplier quote');

  if (quote.status !== 'accepted') {
    quote = await updateSupplierQuoteStatus(
      context.db,
      context.organizationId,
      quote.id,
      'accepted',
    );
    if (!quote) throw new NotFoundError('Supplier quote');
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.SUPPLIER_QUOTE_STATUS_UPDATED,
      entityType: 'supplier_quote',
      entityId: quote.id,
      after: { status: 'accepted', reason: 'accepted_for_po' },
    });
  }

  const lines = await listSupplierQuoteLines(context.db, context.organizationId, quote.id);
  let rfqProjectId: string | null = null;
  let rfqWorkPackageId: string | null = null;
  if (quote.rfqId) {
    const rfq = await findProcurementRfqById(context.db, context.organizationId, quote.rfqId);
    if (rfq) {
      rfqProjectId = rfq.projectId;
      rfqWorkPackageId = rfq.workPackageId;
    }
  }

  const draft = buildPurchaseOrderInputFromAcceptedQuote({
    id: quote.id,
    vendorId: quote.vendorId,
    projectId: quote.projectId,
    status: quote.status,
    currency: quote.currency,
    totalAmount: quote.totalAmount,
    lines,
    rfqProjectId,
    rfqWorkPackageId,
  });

  return createPurchaseOrder(context, {
    vendorId: draft.vendorId,
    projectId: draft.projectId,
    workPackageId: draft.workPackageId,
    supplierQuoteId: draft.supplierQuoteId,
    currency: draft.currency,
    committedAmount: draft.committedAmount,
    lines: draft.lines,
    reference: parsed.data.reference || undefined,
    orderedOn: parsed.data.orderedOn || undefined,
    notes: parsed.data.notes || undefined,
  });
}
