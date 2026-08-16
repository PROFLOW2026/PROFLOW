/**
 * RFQ supplier-quote comparison and accepted-quote → PO mapping.
 * HARD RULE: CommittedCost != Expense - PO committed amounts are not expenses.
 */

import { DomainRuleError } from '@/shared/errors';
import { addMoney, compareMoney, money, toNumericString, zeroMoney } from '@/shared/money';
import { assertCommittedAmountMatchesLines, isCommittedCostActualExpense } from './committed-cost';

export const RFQ_STATUSES = ['draft', 'sent', 'closed', 'cancelled'] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

export const SUPPLIER_QUOTE_STATUSES = [
  'received',
  'shortlisted',
  'accepted',
  'rejected',
] as const;
export type SupplierQuoteStatus = (typeof SUPPLIER_QUOTE_STATUSES)[number];

export interface QuoteComparisonEntry {
  readonly quoteId: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly currency: string;
  /** Header total; falls back to summed line totals when null/empty. */
  readonly totalAmount: string | null;
  readonly status: string;
  readonly lineTotalSum?: string | null;
}

export interface QuoteComparisonRow extends QuoteComparisonEntry {
  readonly comparableTotal: string;
}

function resolveComparableTotal(entry: QuoteComparisonEntry): string {
  const currency = entry.currency.toUpperCase();
  if (entry.totalAmount?.trim()) {
    return toNumericString(money(entry.totalAmount, currency));
  }
  if (entry.lineTotalSum?.trim()) {
    return toNumericString(money(entry.lineTotalSum, currency));
  }
  return toNumericString(zeroMoney(currency));
}

/**
 * Side-by-side vendor totals sorted ascending (best price first).
 * Quotes in different currencies are grouped by currency, then sorted within each group.
 */
export function compareSupplierQuotesByTotal(
  entries: readonly QuoteComparisonEntry[],
): QuoteComparisonRow[] {
  const rows: QuoteComparisonRow[] = entries.map((entry) => ({
    ...entry,
    comparableTotal: resolveComparableTotal(entry),
  }));

  return rows.sort((a, b) => {
    const currencyCmp = a.currency.toUpperCase().localeCompare(b.currency.toUpperCase());
    if (currencyCmp !== 0) return currencyCmp;
    return compareMoney(
      money(a.comparableTotal, a.currency),
      money(b.comparableTotal, b.currency),
    );
  });
}

export interface AcceptedQuoteLineForPo {
  readonly description: string;
  readonly quantity: string;
  readonly unitAmount: string;
  readonly lineTotal: string;
  readonly currency: string;
  readonly materialItemId?: string | null;
}

export interface AcceptedQuoteForPo {
  readonly id: string;
  readonly vendorId: string;
  readonly projectId: string | null;
  readonly status: string;
  readonly currency: string;
  readonly totalAmount: string | null;
  readonly lines: readonly AcceptedQuoteLineForPo[];
  /** Optional RFQ linkage for work package / project fallback. */
  readonly rfqProjectId?: string | null;
  readonly rfqWorkPackageId?: string | null;
}

export interface PurchaseOrderDraftFromQuote {
  readonly vendorId: string;
  readonly projectId?: string;
  readonly workPackageId?: string;
  readonly supplierQuoteId: string;
  readonly currency: string;
  readonly committedAmount: string;
  readonly lines: {
    description: string;
    materialItemId?: string;
    quantity: string;
    unitAmount: string;
    lineTotal: string;
    currency: string;
  }[];
}

/**
 * Maps an accepted supplier quote into createPurchaseOrder input.
 * Asserts CommittedCost != Expense remains true for the resulting commitment.
 */
export function buildPurchaseOrderInputFromAcceptedQuote(
  quote: AcceptedQuoteForPo,
): PurchaseOrderDraftFromQuote {
  if (quote.status !== 'accepted') {
    throw new DomainRuleError(
      'Only accepted supplier quotes can become purchase orders',
      'procurement.errors.quoteNotAccepted',
    );
  }

  if (quote.lines.length === 0) {
    throw new DomainRuleError(
      'Accepted quote must have at least one line',
      'procurement.errors.quoteLinesRequired',
    );
  }

  const currency = quote.currency.toUpperCase();
  let sum = zeroMoney(currency);
  const lines = quote.lines.map((line) => {
    if (line.currency.toUpperCase() !== currency) {
      throw new DomainRuleError(
        'Quote line currency must match the quote currency',
        'procurement.errors.currencyMismatch',
      );
    }
    const lineTotal = money(line.lineTotal, currency);
    sum = addMoney(sum, lineTotal);
    return {
      description: line.description,
      materialItemId: line.materialItemId ?? undefined,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      lineTotal: toNumericString(lineTotal),
      currency,
    };
  });

  const committedAmount = quote.totalAmount?.trim()
    ? toNumericString(money(quote.totalAmount, currency))
    : toNumericString(sum);

  assertCommittedAmountMatchesLines({
    currency,
    committedAmount,
    lines,
  });

  if (isCommittedCostActualExpense()) {
    throw new DomainRuleError(
      'Purchase order commitment must not be treated as an expense',
      'procurement.errors.expenseForbidden',
    );
  }

  const projectId = quote.projectId ?? quote.rfqProjectId ?? undefined;
  const workPackageId = quote.rfqWorkPackageId ?? undefined;

  return {
    vendorId: quote.vendorId,
    projectId: projectId ?? undefined,
    workPackageId: workPackageId ?? undefined,
    supplierQuoteId: quote.id,
    currency,
    committedAmount,
    lines,
  };
}
