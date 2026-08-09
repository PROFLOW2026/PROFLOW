/**
 * Vendor cost recognition (Wave 3 closure).
 *
 * NEW MODEL:
 * - PO issued → Committed future cost (not Actual)
 * - Approved/posted vendor bill → Actual vendor cost (enters Actual / Forecast)
 * - Vendor payment → cash only (never Actual)
 * - Expense linked to the same bill → must not double-count
 *
 * AP bill remains a distinct entity from Expense; recognition does not invent Expense rows.
 */

import {
  addMoney,
  compareMoney,
  money,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { ApBillStatus } from './matching';

/** Posted/approved bills that recognize vendor Actual Cost. */
export const RECOGNIZED_VENDOR_BILL_STATUSES = [
  'open',
  'partially_matched',
  'matched',
] as const satisfies readonly ApBillStatus[];

export type RecognizedVendorBillStatus = (typeof RECOGNIZED_VENDOR_BILL_STATUSES)[number];

export function isRecognizedVendorBillStatus(
  status: string,
): status is RecognizedVendorBillStatus {
  return (
    status === 'open' || status === 'partially_matched' || status === 'matched'
  );
}

/** Draft/void never enter Actual. Payments never call this path. */
export function isVendorBillExcludedFromActual(status: string): boolean {
  return status === 'draft' || status === 'void';
}

export interface VendorCostRecognitionInput {
  readonly currency: string;
  /** Posted bill totals for the project (recognized statuses only). */
  readonly recognizedBillAmounts: readonly string[];
  /**
   * Finalized expense amounts linked via accepted matches to recognized bills.
   * Deducted so bill + expense for the same obligation do not double-count.
   */
  readonly linkedExpenseAmounts: readonly string[];
}

export interface VendorCostRecognitionResult {
  readonly recognizedBillTotal: MoneyValue;
  readonly linkedExpenseTotal: MoneyValue;
  /**
   * Net vendor recognition to fold into Actual Cost / vendorActual:
   * sum(bills) (expenses linked to those bills are excluded upstream).
   */
  readonly netRecognizedVendorActual: MoneyValue;
}

function sumAmounts(currency: string, amounts: readonly string[]): MoneyValue {
  const code = currency.toUpperCase();
  let total = zeroMoney(code);
  for (const amount of amounts) {
    total = addMoney(total, money(amount, code));
  }
  return total;
}

/**
 * Bills are the recognition source. Callers must exclude linked expenses from
 * expense aggregation before adding `netRecognizedVendorActual`.
 */
export function composeVendorCostRecognition(
  input: VendorCostRecognitionInput,
): VendorCostRecognitionResult {
  const currency = input.currency.toUpperCase();
  const recognizedBillTotal = sumAmounts(currency, input.recognizedBillAmounts);
  const linkedExpenseTotal = sumAmounts(currency, input.linkedExpenseAmounts);

  return {
    recognizedBillTotal,
    linkedExpenseTotal,
    netRecognizedVendorActual: recognizedBillTotal,
  };
}

/**
 * Forecast exposure for vendor procurement:
 * Actual (incl. recognized bills) + remaining commitment + ETC.
 * Open AP payable / payments are intentionally omitted (cash only).
 */
export function composeVendorForecastExposure(input: {
  readonly currency: string;
  readonly actualCostToDate: string;
  readonly remainingCommitment: string;
  readonly expectedRemainingCost?: string;
}): {
  readonly actualCostToDate: MoneyValue;
  readonly remainingCommitment: MoneyValue;
  readonly forecastFinalCost: MoneyValue;
  /** True when known vendor cost would vanish (Actual=0 and Commitment=0). */
  readonly losesKnownCost: boolean;
} {
  const currency = input.currency.toUpperCase();
  const actualCostToDate = money(input.actualCostToDate, currency);
  const remainingCommitment = money(input.remainingCommitment, currency);
  const etc = money(input.expectedRemainingCost ?? '0', currency);
  const forecastFinalCost = addMoney(addMoney(actualCostToDate, remainingCommitment), etc);
  const losesKnownCost =
    compareMoney(actualCostToDate, zeroMoney(currency)) === 0 &&
    compareMoney(remainingCommitment, zeroMoney(currency)) === 0;

  return {
    actualCostToDate,
    remainingCommitment,
    forecastFinalCost,
    losesKnownCost,
  };
}

/**
 * When a posted bill is linked to a PO at create time, consume commitment by the
 * bill total so Actual (bill) and Commitment do not double-count before match accept.
 */
export function consumeAmountForPostedPoBill(input: {
  readonly openCommitmentAmount: string;
  readonly billTotal: string;
  readonly currency: string;
}): { consumeAmount: string } {
  const currency = input.currency.toUpperCase();
  const open = money(input.openCommitmentAmount, currency);
  const bill = money(input.billTotal, currency);
  if (compareMoney(bill, open) >= 0) {
    return { consumeAmount: open.amount };
  }
  return { consumeAmount: bill.amount };
}

/**
 * Match accept must not consume again when the bill header already linked the PO
 * and create-time recognition consumed the bill total.
 */
export function shouldConsumeCommitmentOnMatchAccept(input: {
  readonly billPurchaseOrderId: string | null | undefined;
  readonly matchPurchaseOrderId: string | null | undefined;
}): boolean {
  if (!input.matchPurchaseOrderId) return false;
  if (
    input.billPurchaseOrderId &&
    input.billPurchaseOrderId === input.matchPurchaseOrderId
  ) {
    return false;
  }
  return true;
}

/**
 * Fully matching a bill to a PO settles that obligation: release any remaining
 * open commitment (under-bill variance). Progress bills that stay open /
 * partially_matched keep remaining commitment.
 */
export function shouldReleaseRemainingCommitmentOnSettlement(input: {
  readonly billStatusAfterAccept: ApBillStatus;
  readonly purchaseOrderId: string | null | undefined;
}): boolean {
  return input.billStatusAfterAccept === 'matched' && Boolean(input.purchaseOrderId);
}

/** Guard: payments never contribute to Actual / recognition. */
export function isVendorPaymentRecognizedActual(): false {
  return false;
}

/**
 * Net actual after replacing linked expenses with recognized bills.
 * Used by pure unit tests of the composition invariant.
 */
export function netActualAfterVendorRecognition(input: {
  readonly currency: string;
  readonly expenseActualTotal: string;
  readonly linkedExpenseAmounts: readonly string[];
  readonly recognizedBillAmounts: readonly string[];
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  let actual = money(input.expenseActualTotal, currency);
  for (const linked of input.linkedExpenseAmounts) {
    actual = subtractMoney(actual, money(linked, currency));
    if (compareMoney(actual, zeroMoney(currency)) < 0) {
      actual = zeroMoney(currency);
    }
  }
  const recognition = composeVendorCostRecognition({
    currency,
    recognizedBillAmounts: input.recognizedBillAmounts,
    linkedExpenseAmounts: input.linkedExpenseAmounts,
  });
  return addMoney(actual, recognition.netRecognizedVendorActual);
}
