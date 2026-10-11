/**
 * Owner policy: installment (and partial) expense Actual / profitability NET is recognized
 * only in the calendar month when cash was paid — not on purchase date or planned spread.
 *
 * Cash out remains GROSS in month-cash-flow (separate module).
 */

import { yearMonthFromBusinessDate } from '@/modules/month-close';
import { businessDate, type BusinessDate } from '@/shared/dates';
import {
  addMoney,
  fromNumericString,
  isPositiveMoney,
  isZeroMoney,
  money,
  roundMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { resolveCashInstallmentLines } from './cash-installment-schedule';

export interface ExpensePaymentRecognitionFields {
  readonly netAmount: string;
  readonly grossAmount: string;
  readonly taxAmount?: string | null;
  readonly currency: string;
  readonly expenseDate: string;
  readonly installmentCount: number;
  readonly installmentStartDate: string | null;
  readonly installmentsPaidCount: number;
  readonly paidGrossAmount: string | null;
  readonly paidAt: string | null;
  readonly cashInstallmentSchedule: unknown;
}

function netFromGrossSlice(
  grossSlice: MoneyValue,
  netTotal: MoneyValue,
  grossTotal: MoneyValue,
): MoneyValue {
  if (isZeroMoney(grossTotal)) return zeroMoney(grossSlice.currency);
  const ratio = Number(netTotal.amount) / Number(grossTotal.amount);
  return roundMoney(money(String(Number(grossSlice.amount) * ratio), grossSlice.currency));
}

function paymentYearMonth(date: BusinessDate | null): string | null {
  if (!date) return null;
  return yearMonthFromBusinessDate(date);
}

/**
 * NET recognized in `yearMonth` for one expense (installments + single-payment partials).
 * Returns null when nothing is recognized that month.
 */
export function recognizedExpenseNetInYearMonth(
  fields: ExpensePaymentRecognitionFields,
  yearMonth: string,
): MoneyValue | null {
  const currency = fields.currency;
  const netTotal = fromNumericString(fields.netAmount, currency);
  const grossTotal = fromNumericString(fields.grossAmount, currency);
  if (!netTotal || !grossTotal || isZeroMoney(grossTotal)) return null;

  const count = fields.installmentCount;
  if (!Number.isInteger(count) || count <= 1) {
    const paidGross = fromNumericString(fields.paidGrossAmount ?? '0', currency) ?? zeroMoney(currency);
    if (isPositiveMoney(paidGross)) {
      const paidYm = paymentYearMonth(fields.paidAt ? businessDate(fields.paidAt) : null);
      if (paidYm !== yearMonth) return null;
      if (Number(paidGross.amount) >= Number(grossTotal.amount)) {
        return roundMoney(netTotal);
      }
      return netFromGrossSlice(paidGross, netTotal, grossTotal);
    }
    const purchaseYm = yearMonthFromBusinessDate(businessDate(fields.expenseDate));
    if (purchaseYm === yearMonth) return roundMoney(netTotal);
    return null;
  }

  const schedule = resolveCashInstallmentLines({
    totalGross: grossTotal,
    installmentCount: count,
    startDate: businessDate(fields.installmentStartDate ?? fields.expenseDate),
    stored: fields.cashInstallmentSchedule,
  });
  const paidGross =
    fromNumericString(fields.paidGrossAmount ?? '0', currency) ?? zeroMoney(currency);
  const completed = Math.min(Math.max(fields.installmentsPaidCount, 0), schedule.length);

  let monthNet = zeroMoney(currency);

  for (let index = 0; index < completed; index += 1) {
    const line = schedule[index];
    if (!line) continue;
    const lineYm = yearMonthFromBusinessDate(line.dueDate);
    if (lineYm !== yearMonth) continue;
    monthNet = addMoney(monthNet, netFromGrossSlice(line.amount, netTotal, grossTotal));
  }

  let covered = zeroMoney(currency);
  for (let index = 0; index < completed; index += 1) {
    const line = schedule[index];
    if (line) covered = addMoney(covered, line.amount);
  }
  const extra = subtractMoney(paidGross, covered);
  const openIndex = completed < schedule.length ? completed : null;
  if (
    isPositiveMoney(extra) &&
    openIndex != null &&
    paymentYearMonth(fields.paidAt ? businessDate(fields.paidAt) : null) === yearMonth
  ) {
    monthNet = addMoney(monthNet, netFromGrossSlice(extra, netTotal, grossTotal));
  }

  return isZeroMoney(monthNet) ? null : roundMoney(monthNet);
}

/** GROSS cash recognized in `yearMonth` (paid installments / partial payments). */
export function recognizedExpenseGrossInYearMonth(
  fields: ExpensePaymentRecognitionFields,
  yearMonth: string,
): MoneyValue | null {
  const currency = fields.currency;
  const grossTotal = fromNumericString(fields.grossAmount, currency);
  if (!grossTotal || isZeroMoney(grossTotal)) return null;

  const count = fields.installmentCount;
  if (!Number.isInteger(count) || count <= 1) {
    const paidGross = fromNumericString(fields.paidGrossAmount ?? '0', currency) ?? zeroMoney(currency);
    if (isPositiveMoney(paidGross)) {
      const paidYm = paymentYearMonth(fields.paidAt ? businessDate(fields.paidAt) : null);
      if (paidYm !== yearMonth) return null;
      return roundMoney(paidGross);
    }
    const purchaseYm = yearMonthFromBusinessDate(businessDate(fields.expenseDate));
    if (purchaseYm === yearMonth) return roundMoney(grossTotal);
    return null;
  }

  const schedule = resolveCashInstallmentLines({
    totalGross: grossTotal,
    installmentCount: count,
    startDate: businessDate(fields.installmentStartDate ?? fields.expenseDate),
    stored: fields.cashInstallmentSchedule,
  });
  const paidGross =
    fromNumericString(fields.paidGrossAmount ?? '0', currency) ?? zeroMoney(currency);
  const completed = Math.min(Math.max(fields.installmentsPaidCount, 0), schedule.length);

  let monthGross = zeroMoney(currency);
  for (let index = 0; index < completed; index += 1) {
    const line = schedule[index];
    if (!line) continue;
    if (yearMonthFromBusinessDate(line.dueDate) !== yearMonth) continue;
    monthGross = addMoney(monthGross, line.amount);
  }

  let covered = zeroMoney(currency);
  for (let index = 0; index < completed; index += 1) {
    const line = schedule[index];
    if (line) covered = addMoney(covered, line.amount);
  }
  const extra = subtractMoney(paidGross, covered);
  const openIndex = completed < schedule.length ? completed : null;
  if (
    isPositiveMoney(extra) &&
    openIndex != null &&
    paymentYearMonth(fields.paidAt ? businessDate(fields.paidAt) : null) === yearMonth
  ) {
    monthGross = addMoney(monthGross, extra);
  }

  return isZeroMoney(monthGross) ? null : roundMoney(monthGross);
}

function* yearMonthsInclusive(fromYm: string, toYm: string): Generator<string> {
  let [y, m] = fromYm.split('-').map(Number) as [number, number];
  const [ty, tm] = toYm.split('-').map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    yield `${y}-${String(m).padStart(2, '0')}`;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
}

/** Cumulative NET recognized from expense month through `throughYearMonth` (inclusive). */
export function recognizedExpenseNetThroughYearMonth(
  fields: ExpensePaymentRecognitionFields,
  throughYearMonth: string,
): MoneyValue {
  const currency = fields.currency;
  let total = zeroMoney(currency);
  const startYm = yearMonthFromBusinessDate(businessDate(fields.expenseDate));
  for (const ym of yearMonthsInclusive(startYm, throughYearMonth)) {
    const slice = recognizedExpenseNetInYearMonth(fields, ym);
    if (slice) total = addMoney(total, slice);
  }
  return roundMoney(total);
}
