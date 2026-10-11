/**
 * Expense cash vs accepted AP bill matches. Matched NET is converted to a gross
 * cash deduction so partial matches keep the unmatched expense remainder in cash.
 */

import { tripletFromNet } from '@/modules/billing/domain/revenue-position';
import { toDecimalValue } from '@/shared/money';
import {
  compareMoney,
  fromNumericString,
  isPositiveMoney,
  isZeroMoney,
  minMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

export interface ExpenseApCashDocument {
  readonly grossAmount: string;
  readonly netAmount?: string | null;
  readonly taxAmount?: string | null;
  readonly currency: string;
}

function vatRateFromDocument(document: ExpenseApCashDocument) {
  const currency = document.currency;
  const grossDoc = fromNumericString(document.grossAmount, currency);
  const netDoc = document.netAmount ? fromNumericString(document.netAmount, currency) : null;
  const taxDoc = document.taxAmount ? fromNumericString(document.taxAmount, currency) : null;
  if (!grossDoc || !netDoc || !taxDoc || isZeroMoney(taxDoc) || compareMoney(netDoc, grossDoc) === 0) {
    return null;
  }
  if (isZeroMoney(netDoc)) return null;
  return toDecimalValue(taxDoc).dividedBy(toDecimalValue(netDoc));
}

/** Gross cash no longer expected on the expense path — AP payment covers this slice. */
export function expenseApMatchedGrossDeduction(
  matchedNetAmount: string,
  document: ExpenseApCashDocument,
): MoneyValue {
  const currency = document.currency.toUpperCase();
  const matchedNet = fromNumericString(matchedNetAmount || '0', currency) ?? zeroMoney(currency);
  if (!isPositiveMoney(matchedNet)) return zeroMoney(currency);

  const grossDoc = fromNumericString(document.grossAmount, currency);
  if (!grossDoc) return matchedNet;

  const rate = vatRateFromDocument(document);
  if (!rate) {
    return minMoney(matchedNet, grossDoc);
  }
  const matchedGross = tripletFromNet(matchedNet, rate).gross;
  return minMoney(matchedGross, grossDoc);
}

export function expenseGrossAfterApMatches(
  document: ExpenseApCashDocument & { readonly acceptedApMatchedNetAmount?: string | null },
): MoneyValue {
  const currency = document.currency;
  const gross = fromNumericString(document.grossAmount, currency) ?? zeroMoney(currency);
  const deduct = expenseApMatchedGrossDeduction(document.acceptedApMatchedNetAmount ?? '0', document);
  const remaining = subtractMoney(gross, deduct);
  if (compareMoney(remaining, zeroMoney(currency)) <= 0) return zeroMoney(currency);
  return remaining;
}

export function isExpenseFullyApMatchedForCash(
  document: ExpenseApCashDocument & { readonly acceptedApMatchedNetAmount?: string | null },
): boolean {
  return !isPositiveMoney(expenseGrossAfterApMatches(document));
}

/** YYYY-MM from a business date (calendar month of the cash obligation). */
export function yearMonthFromBusinessDate(date: string): string {
  return date.slice(0, 7);
}

/**
 * Skip a recurring draft forecast line when that calendar month already has a
 * paid occurrence (generated expense fully settled on the expense cash path).
 */
export function recurringDraftCashForecastBlocked(
  draftId: string,
  dueDate: string,
  paidOccurrenceMonthsByDraftId: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const month = yearMonthFromBusinessDate(dueDate);
  const paid = paidOccurrenceMonthsByDraftId.get(draftId);
  return paid?.has(month) ?? false;
}
