/**
 * Expense cash vs accepted AP bill matches. Matched amounts on ap_po_matches are GROSS.
 */

import {
  compareMoney,
  divideMoney,
  fromNumericString,
  isPositiveMoney,
  minMoney,
  multiplyMoney,
  roundMoney,
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

/** Gross cash no longer expected on the expense path — AP match covers this slice. */
export function expenseApMatchedGrossDeduction(
  matchedGrossAmount: string,
  document: ExpenseApCashDocument,
): MoneyValue {
  const currency = document.currency.toUpperCase();
  const matchedGross =
    fromNumericString(matchedGrossAmount || '0', currency) ?? zeroMoney(currency);
  if (!isPositiveMoney(matchedGross)) return zeroMoney(currency);

  const grossDoc = fromNumericString(document.grossAmount, currency);
  if (!grossDoc) return matchedGross;
  return minMoney(matchedGross, grossDoc);
}

/** `acceptedApMatchedNetAmount` is NET matched on the expense; map to gross cash deduction. */
export function apMatchedGrossDeductionForExpense(
  document: ExpenseApCashDocument & { readonly acceptedApMatchedNetAmount?: string | null },
): MoneyValue {
  const currency = document.currency.toUpperCase();
  const matchedNet =
    fromNumericString(document.acceptedApMatchedNetAmount ?? '0', currency) ?? zeroMoney(currency);
  if (!isPositiveMoney(matchedNet)) return zeroMoney(currency);

  const grossDoc = fromNumericString(document.grossAmount, currency);
  const netDoc = fromNumericString(document.netAmount ?? document.grossAmount, currency);
  if (!grossDoc || !netDoc) {
    return expenseApMatchedGrossDeduction(document.acceptedApMatchedNetAmount ?? '0', {
      grossAmount: document.grossAmount,
      currency,
    });
  }
  if (compareMoney(netDoc, grossDoc) === 0) {
    return minMoney(matchedNet, grossDoc);
  }
  const grossDeduct = roundMoney(
    divideMoney(multiplyMoney(grossDoc, matchedNet.amount), netDoc.amount),
  );
  return minMoney(grossDeduct, grossDoc);
}

export function expenseGrossAfterApMatches(
  document: ExpenseApCashDocument & { readonly acceptedApMatchedNetAmount?: string | null },
): MoneyValue {
  const currency = document.currency;
  const gross = fromNumericString(document.grossAmount, currency) ?? zeroMoney(currency);
  const deduct = apMatchedGrossDeductionForExpense(document);
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
