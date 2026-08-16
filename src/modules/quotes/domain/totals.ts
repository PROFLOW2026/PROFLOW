import Decimal from 'decimal.js';
import {
  addMoney,
  money,
  multiplyMoney,
  subtractMoney,
  toNumericString,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { computeTaxAmountBreakdown } from '@/modules/tax/domain/amounts';
import type { ResolvedTaxRate } from '@/modules/tax/domain/types';
import type { QuoteTaxMode } from './types';

export interface QuoteLineInput {
  readonly description: string;
  readonly quantity: string;
  readonly unit?: string | null;
  readonly unitPriceAmount: string;
  readonly estimatedUnitCostAmount?: string | null;
  readonly notes?: string | null;
}

export interface ComputedQuoteLine {
  readonly description: string;
  readonly quantity: string;
  readonly unit: string | null;
  readonly unitPriceAmount: string;
  readonly estimatedUnitCostAmount: string | null;
  readonly lineTotalAmount: string;
  readonly lineEstimatedCostAmount: string | null;
  readonly notes: string | null;
  readonly sortOrder: number;
}

export interface QuoteTotalsResult {
  readonly lines: readonly ComputedQuoteLine[];
  readonly subtotalAmount: string;
  readonly taxAmount: string | null;
  readonly totalAmount: string;
  readonly estimatedCostAmount: string | null;
  readonly estimatedMarginPercent: string | null;
}

function lineTotal(quantity: string, unitPrice: string, currency: string): MoneyValue {
  return multiplyMoney(money(unitPrice, currency), quantity);
}

function lineCost(
  quantity: string,
  unitCost: string | null | undefined,
  currency: string,
): MoneyValue | null {
  if (unitCost == null || String(unitCost).trim() === '') return null;
  return multiplyMoney(money(unitCost, currency), quantity);
}

/**
 * Pre-win profitability estimate only - never Actual, never revenue recognition.
 * Margin % = (subtotal − estimatedCost) / subtotal × 100 when cost is present.
 */
export function computeEstimatedMarginPercent(
  subtotal: MoneyValue,
  estimatedCost: MoneyValue | null,
): string | null {
  if (!estimatedCost) return null;
  const sub = new Decimal(subtotal.amount);
  if (sub.isZero()) return null;
  const cost = new Decimal(estimatedCost.amount);
  return sub.minus(cost).dividedBy(sub).times(100).toFixed(6);
}

/**
 * Line markup % = (price − cost) / cost × 100 when cost &gt; 0.
 * Optional helper for UI; not stored on the quote header.
 */
export function computeLineMarkupPercent(unitPrice: string, unitCost: string | null): string | null {
  if (unitCost == null || String(unitCost).trim() === '') return null;
  const cost = new Decimal(unitCost);
  if (cost.lte(0)) return null;
  return new Decimal(unitPrice).minus(cost).dividedBy(cost).times(100).toFixed(6);
}

export function computeLineMarginPercent(unitPrice: string, unitCost: string | null): string | null {
  if (unitCost == null || String(unitCost).trim() === '') return null;
  const price = new Decimal(unitPrice);
  if (price.isZero()) return null;
  return price.minus(unitCost).dividedBy(price).times(100).toFixed(6);
}

/**
 * Rolls up line nets and applies org tax authority for exclusive/inclusive modes.
 * Tax is display/compliance context - subtotal (net commercial) feeds convert contract.
 */
export function computeQuoteTotals(input: {
  readonly lines: readonly QuoteLineInput[];
  readonly currency: string;
  readonly taxMode: QuoteTaxMode;
  readonly resolved: Pick<ResolvedTaxRate, 'method' | 'ratePercent'> | null;
}): QuoteTotalsResult {
  const currency = input.currency.toUpperCase();
  const computedLines: ComputedQuoteLine[] = input.lines.map((line, index) => {
    const total = lineTotal(line.quantity, line.unitPriceAmount, currency);
    const cost = lineCost(line.quantity, line.estimatedUnitCostAmount, currency);
    return {
      description: line.description.trim(),
      quantity: line.quantity,
      unit: line.unit?.trim() || null,
      unitPriceAmount: toNumericString(money(line.unitPriceAmount, currency)),
      estimatedUnitCostAmount:
        line.estimatedUnitCostAmount != null && String(line.estimatedUnitCostAmount).trim() !== ''
          ? toNumericString(money(line.estimatedUnitCostAmount, currency))
          : null,
      lineTotalAmount: toNumericString(total),
      lineEstimatedCostAmount: cost ? toNumericString(cost) : null,
      notes: line.notes?.trim() || null,
      sortOrder: index,
    };
  });

  const lineMoneys = computedLines.map((line) => money(line.lineTotalAmount, currency));
  const linesSubtotal =
    lineMoneys.length === 0
      ? zeroMoney(currency)
      : lineMoneys.reduce((acc, value) => addMoney(acc, value));

  const costParts = computedLines
    .map((line) =>
      line.lineEstimatedCostAmount ? money(line.lineEstimatedCostAmount, currency) : null,
    )
    .filter((value): value is MoneyValue => value != null);

  const estimatedCost =
    costParts.length === 0
      ? null
      : costParts.reduce((acc, value) => addMoney(acc, value));

  if (input.taxMode === 'none' || !input.resolved) {
    return {
      lines: computedLines,
      subtotalAmount: toNumericString(linesSubtotal),
      taxAmount: null,
      totalAmount: toNumericString(linesSubtotal),
      estimatedCostAmount: estimatedCost ? toNumericString(estimatedCost) : null,
      estimatedMarginPercent: computeEstimatedMarginPercent(linesSubtotal, estimatedCost),
    };
  }

  const amountIncludesTax = input.taxMode === 'inclusive';
  const breakdown = computeTaxAmountBreakdown({
    enteredAmount: linesSubtotal,
    currency,
    amountIncludesTax,
    resolved: input.resolved,
  });

  // Inclusive: line prices summed as gross → net becomes commercial subtotal.
  const subtotal = amountIncludesTax ? breakdown.net : breakdown.net;
  const tax = breakdown.tax;
  const total = amountIncludesTax
    ? breakdown.gross
    : addMoney(subtotal, tax);

  // When exclusive, lines are already net; when inclusive, restate header net.
  const headerSubtotal = amountIncludesTax ? subtotal : linesSubtotal;
  const headerEstimatedMargin = computeEstimatedMarginPercent(headerSubtotal, estimatedCost);

  return {
    lines: computedLines,
    subtotalAmount: toNumericString(headerSubtotal),
    taxAmount: toNumericString(tax),
    totalAmount: toNumericString(total),
    estimatedCostAmount: estimatedCost ? toNumericString(estimatedCost) : null,
    estimatedMarginPercent: headerEstimatedMargin,
  };
}

/** Contract opening uses commercial net (subtotal), never tax as revenue. */
export function contractNetFromQuote(subtotalAmount: string | null): string | null {
  if (subtotalAmount == null || String(subtotalAmount).trim() === '') return null;
  return subtotalAmount;
}

export function estimatedProfitPreview(subtotalAmount: string, estimatedCostAmount: string | null, currency: string): {
  readonly estimatedProfit: string | null;
  readonly isRevenue: false;
} {
  if (!estimatedCostAmount) return { estimatedProfit: null, isRevenue: false };
  const profit = subtractMoney(money(subtotalAmount, currency), money(estimatedCostAmount, currency));
  return { estimatedProfit: toNumericString(profit), isRevenue: false };
}
