/**
 * Selected-month cash movement. Payment date and due date only.
 * Recognized cost is not an input and is never added here.
 */

import type { BusinessDate } from '@/shared/dates';
import { compareBusinessDates } from '@/shared/dates';
import {
  addMoney,
  fromNumericString,
  isPositiveMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { buildCashInstallmentSchedule } from '@/modules/expenses/domain/cash-installment-schedule';

export type MonthCashSource = 'ap' | 'expense' | 'payroll' | 'subcontract_advance';

export interface MonthCashPaidLine {
  readonly id: string;
  readonly source: MonthCashSource;
  readonly party: string;
  readonly document: string;
  readonly paymentDate: BusinessDate;
  readonly amount: MoneyValue;
  readonly reference: string | null;
}

export interface MonthCashExpectedLine {
  readonly id: string;
  readonly source: MonthCashSource;
  readonly party: string;
  readonly document: string;
  readonly dueDate: BusinessDate;
  readonly paymentTerms: string | null;
  readonly remaining: MoneyValue;
  readonly status: string;
}

export interface MonthCashFlow {
  readonly collectionsActual: MoneyValue;
  readonly paidActual: MoneyValue;
  readonly expectedOutgoing: MoneyValue;
  readonly netCash: MoneyValue;
  readonly forecastAfterRemaining: MoneyValue;
  readonly paidLines: readonly MonthCashPaidLine[];
  readonly expectedLines: readonly MonthCashExpectedLine[];
}

export interface MonthExpenseCashSnapshot {
  readonly id: string;
  readonly party: string;
  readonly document: string;
  readonly grossAmount: string;
  readonly currency: string;
  readonly expenseDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly paymentTerms: string | null;
  readonly installmentCount: number;
  readonly installmentStartDate: BusinessDate | null;
  readonly installmentsPaidCount: number;
  readonly paidGrossAmount: string | null;
  readonly paidAt: BusinessDate | null;
  readonly paymentMethod: string | null;
  /** Accepted match to a recognized vendor bill — AP payment is the cash. */
  readonly recognizedApMatch: boolean;
  readonly voided: boolean;
}

export interface MonthPayrollCashSnapshot {
  readonly id: string;
  readonly party: string;
  readonly document: string;
  readonly expectedAmount: string;
  readonly paidAmount: string | null;
  readonly currency: string;
  readonly dueDate: BusinessDate | null;
  readonly paidAt: BusinessDate | null;
  readonly voided: boolean;
}

export interface MonthAdvanceCashSnapshot {
  readonly id: string;
  readonly party: string;
  readonly document: string;
  readonly amount: string;
  readonly currency: string;
  readonly paidDate: BusinessDate | null;
  readonly status: string;
  readonly reference: string | null;
}

const PAID_ADVANCE_STATUSES = new Set([
  'paid',
  'partially_applied',
  'fully_applied',
  'partially_refunded',
  'fully_refunded',
]);

function inMonth(date: BusinessDate | null, from: BusinessDate, to: BusinessDate): date is BusinessDate {
  if (!date) return false;
  return compareBusinessDates(date, from) >= 0 && compareBusinessDates(date, to) <= 0;
}

function sameCurrency(amount: MoneyValue, currency: string): boolean {
  return amount.currency.toUpperCase() === currency.toUpperCase();
}

export function expandExpenseMonthCash(
  row: MonthExpenseCashSnapshot,
  currency: string,
  from: BusinessDate,
  to: BusinessDate,
): { readonly paid: MonthCashPaidLine[]; readonly expected: MonthCashExpectedLine[] } {
  if (row.voided || row.recognizedApMatch) return { paid: [], expected: [] };
  if (row.currency.toUpperCase() !== currency.toUpperCase()) return { paid: [], expected: [] };

  const total = fromNumericString(row.grossAmount, currency);
  if (!total || !isPositiveMoney(total)) return { paid: [], expected: [] };
  const paid = fromNumericString(row.paidGrossAmount ?? '0', currency) ?? zeroMoney(currency);
  const paidLines: MonthCashPaidLine[] = [];
  const expectedLines: MonthCashExpectedLine[] = [];

  if (row.installmentCount <= 1) {
    if (isPositiveMoney(paid) && inMonth(row.paidAt, from, to)) {
      paidLines.push({
        id: `expense:${row.id}`,
        source: 'expense',
        party: row.party,
        document: row.document,
        paymentDate: row.paidAt,
        amount: paid,
        reference: row.paymentMethod,
      });
    }
    const remaining = subtractMoney(total, paid);
    if (isPositiveMoney(remaining) && inMonth(row.dueDate, from, to)) {
      expectedLines.push({
        id: `expense:${row.id}`,
        source: 'expense',
        party: row.party,
        document: row.document,
        dueDate: row.dueDate,
        paymentTerms: row.paymentTerms,
        remaining,
        status: isPositiveMoney(paid) ? 'partial' : 'unpaid',
      });
    }
    return { paid: paidLines, expected: expectedLines };
  }

  const schedule = buildCashInstallmentSchedule({
    totalGross: total,
    installmentCount: row.installmentCount,
    startDate: row.installmentStartDate ?? row.expenseDate,
  });
  const completed = Math.min(Math.max(row.installmentsPaidCount, 0), schedule.length);
  let covered = zeroMoney(currency);
  for (let index = 0; index < completed; index += 1) {
    const line = schedule[index];
    if (!line) continue;
    covered = addMoney(covered, line.amount);
    if (!inMonth(line.dueDate, from, to)) continue;
    paidLines.push({
      id: `expense:${row.id}:inst-${index}`,
      source: 'expense',
      party: row.party,
      document: row.document,
      paymentDate: line.dueDate,
      amount: line.amount,
      reference: row.paymentMethod,
    });
  }

  const extra = subtractMoney(paid, covered);
  const openIndex = completed < schedule.length ? completed : null;
  if (isPositiveMoney(extra) && openIndex != null && inMonth(row.paidAt, from, to)) {
    paidLines.push({
      id: `expense:${row.id}:partial-${openIndex}`,
      source: 'expense',
      party: row.party,
      document: row.document,
      paymentDate: row.paidAt,
      amount: extra,
      reference: row.paymentMethod,
    });
  }

  for (let index = completed; index < schedule.length; index += 1) {
    const line = schedule[index];
    if (!line || !inMonth(line.dueDate, from, to)) continue;
    const already = index === openIndex && isPositiveMoney(extra) ? extra : zeroMoney(currency);
    const remaining = subtractMoney(line.amount, already);
    if (!isPositiveMoney(remaining)) continue;
    expectedLines.push({
      id: `expense:${row.id}:inst-${index}`,
      source: 'expense',
      party: row.party,
      document: row.document,
      dueDate: line.dueDate,
      paymentTerms: row.paymentTerms,
      remaining,
      status: isPositiveMoney(already) ? 'partial' : 'unpaid',
    });
  }

  return { paid: paidLines, expected: expectedLines };
}

export function composeMonthCashFlow(input: {
  readonly currency: string;
  readonly from: BusinessDate;
  readonly to: BusinessDate;
  readonly collectionsActual: MoneyValue;
  readonly apPayments: readonly MonthCashPaidLine[];
  readonly apExpected: readonly MonthCashExpectedLine[];
  readonly expenses: readonly MonthExpenseCashSnapshot[];
  readonly payroll: readonly MonthPayrollCashSnapshot[];
  readonly advances: readonly MonthAdvanceCashSnapshot[];
}): MonthCashFlow {
  const currency = input.currency.toUpperCase();
  const paid: MonthCashPaidLine[] = [];
  const expected: MonthCashExpectedLine[] = [];
  const seenPaid = new Set<string>();

  function pushPaid(line: MonthCashPaidLine): void {
    if (seenPaid.has(line.id)) return;
    if (!sameCurrency(line.amount, currency) || !isPositiveMoney(line.amount)) return;
    if (!inMonth(line.paymentDate, input.from, input.to)) return;
    seenPaid.add(line.id);
    paid.push(line);
  }

  function pushExpected(line: MonthCashExpectedLine): void {
    if (!sameCurrency(line.remaining, currency) || !isPositiveMoney(line.remaining)) return;
    if (!inMonth(line.dueDate, input.from, input.to)) return;
    if (line.status === 'void' || line.status === 'cancelled') return;
    expected.push(line);
  }

  for (const line of input.apPayments) pushPaid(line);
  for (const line of input.apExpected) pushExpected(line);
  for (const row of input.expenses) {
    const expanded = expandExpenseMonthCash(row, currency, input.from, input.to);
    for (const line of expanded.paid) pushPaid(line);
    for (const line of expanded.expected) pushExpected(line);
  }

  for (const row of input.payroll) {
    if (row.voided || row.currency.toUpperCase() !== currency) continue;
    const paidAmount = fromNumericString(row.paidAmount ?? '0', currency) ?? zeroMoney(currency);
    const expectedAmount =
      fromNumericString(row.expectedAmount, currency) ?? zeroMoney(currency);
    if (isPositiveMoney(paidAmount) && inMonth(row.paidAt, input.from, input.to)) {
      pushPaid({
        id: `payroll:${row.id}`,
        source: 'payroll',
        party: row.party,
        document: row.document,
        paymentDate: row.paidAt,
        amount: paidAmount,
        reference: null,
      });
    }
    const remaining = subtractMoney(expectedAmount, paidAmount);
    if (isPositiveMoney(remaining) && inMonth(row.dueDate, input.from, input.to)) {
      pushExpected({
        id: `payroll:${row.id}`,
        source: 'payroll',
        party: row.party,
        document: row.document,
        dueDate: row.dueDate,
        paymentTerms: null,
        remaining,
        status: isPositiveMoney(paidAmount) ? 'partial' : 'unpaid',
      });
    }
  }

  for (const row of input.advances) {
    if (row.status === 'voided' || row.currency.toUpperCase() !== currency) continue;
    if (!PAID_ADVANCE_STATUSES.has(row.status) || !row.paidDate) continue;
    const amount = fromNumericString(row.amount, currency);
    if (!amount) continue;
    pushPaid({
      id: `advance:${row.id}`,
      source: 'subcontract_advance',
      party: row.party,
      document: row.document,
      paymentDate: row.paidDate,
      amount,
      reference: row.reference,
    });
  }

  const collections = sameCurrency(input.collectionsActual, currency)
    ? input.collectionsActual
    : zeroMoney(currency);
  const paidActual = paid.reduce((sum, line) => addMoney(sum, line.amount), zeroMoney(currency));
  const expectedOutgoing = expected.reduce(
    (sum, line) => addMoney(sum, line.remaining),
    zeroMoney(currency),
  );
  const netCash = subtractMoney(collections, paidActual);
  const forecastAfterRemaining = subtractMoney(netCash, expectedOutgoing);

  return {
    collectionsActual: collections,
    paidActual,
    expectedOutgoing,
    netCash,
    forecastAfterRemaining,
    paidLines: paid,
    expectedLines: expected,
  };
}
