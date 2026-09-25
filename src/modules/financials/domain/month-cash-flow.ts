/**
 * Selected-month cash movement. Payment date and due date only.
 * Recognized cost is not an input and is never added here.
 */

import type { BusinessDate } from '@/shared/dates';
import { compareBusinessDates } from '@/shared/dates';
import {
  tripletFromGross,
  zeroTriplet,
  type RevenueTriplet,
} from '@/modules/billing/domain/revenue-position';
import { resolveCashInstallmentLines } from '@/modules/expenses/domain/cash-installment-schedule';
import {
  addMoney,
  compareMoney,
  fromNumericString,
  isPositiveMoney,
  isZeroMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

export type MonthCashSource = 'ap' | 'expense' | 'payroll' | 'subcontract_advance';

export interface MonthCashPaidLine {
  readonly id: string;
  readonly source: MonthCashSource;
  readonly party: string;
  readonly document: string;
  readonly paymentDate: BusinessDate;
  /** Real cash paid. Unchanged by the NET/GROSS display split. */
  readonly amount: MoneyValue;
  /** Display split from the source document. Omitted means no VAT: NET = GROSS = cash. */
  readonly display?: RevenueTriplet;
  readonly reference: string | null;
}

export interface MonthCashExpectedLine {
  readonly id: string;
  readonly source: MonthCashSource;
  readonly party: string;
  readonly document: string;
  readonly dueDate: BusinessDate;
  readonly paymentTerms: string | null;
  /** Real remaining cash. Unchanged by the NET/GROSS display split. */
  readonly remaining: MoneyValue;
  /** Display split from the source document. Omitted means no VAT: NET = GROSS = cash. */
  readonly display?: RevenueTriplet;
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
  /**
   * Presentation totals. Each side is the sum of stored NET and stored GROSS.
   * Cash scalars above stay the real cash amounts.
   */
  readonly display: {
    readonly collections: RevenueTriplet;
    readonly paid: RevenueTriplet;
    readonly expected: RevenueTriplet;
    readonly netCash: RevenueTriplet;
    readonly forecast: RevenueTriplet;
  };
}

export interface MonthExpenseCashSnapshot {
  readonly id: string;
  readonly party: string;
  readonly document: string;
  readonly grossAmount: string;
  readonly netAmount?: string | null;
  readonly taxAmount?: string | null;
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
  readonly cashInstallmentSchedule?: unknown;
  /** Accepted match to a recognized vendor bill — AP payment is the cash. */
  readonly recognizedApMatch: boolean;
  readonly voided: boolean;
}

export interface MonthPayrollCashSnapshot {
  readonly id: string;
  readonly employeeId?: string;
  readonly payrollPeriod?: string;
  readonly party: string;
  readonly document: string;
  readonly expectedAmount: string;
  readonly paidAmount: string | null;
  readonly currency: string;
  readonly dueDate: BusinessDate | null;
  readonly paidAt: BusinessDate | null;
  readonly voided: boolean;
}

export function payrollEmployeeMonthKey(
  employeeId: string | undefined,
  payrollPeriod: string | undefined,
): string | null {
  if (!employeeId || !payrollPeriod) return null;
  return `${employeeId}:${payrollPeriod}`;
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

const TECHNICAL_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Display text only. A database id is never a name. */
export function cashLineDisplayText(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || TECHNICAL_ID.test(trimmed)) return '';
  return trimmed;
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

export function noVatTriplet(amount: MoneyValue): RevenueTriplet {
  return { net: amount, vat: zeroMoney(amount.currency), gross: amount };
}

export function addTriplets(left: RevenueTriplet, right: RevenueTriplet): RevenueTriplet {
  return {
    net: addMoney(left.net, right.net),
    vat: addMoney(left.vat, right.vat),
    gross: addMoney(left.gross, right.gross),
  };
}

export function subtractTriplets(left: RevenueTriplet, right: RevenueTriplet): RevenueTriplet {
  return {
    net: subtractMoney(left.net, right.net),
    vat: subtractMoney(left.vat, right.vat),
    gross: subtractMoney(left.gross, right.gross),
  };
}

function sumTriplets(items: readonly RevenueTriplet[], currency: string): RevenueTriplet {
  return items.reduce((sum, item) => addTriplets(sum, item), zeroTriplet(currency));
}

/**
 * Split one cash slice using that document's stored NET / VAT / GROSS.
 * A document with no VAT stays NET = GROSS. Never applies a blanket tax rate.
 */
export function documentCashTriplet(
  cash: MoneyValue,
  document: {
    readonly netAmount?: string | null;
    readonly taxAmount?: string | null;
    readonly grossAmount?: string | null;
  },
): RevenueTriplet {
  const grossDoc = document.grossAmount
    ? fromNumericString(document.grossAmount, cash.currency)
    : null;
  const netDoc = document.netAmount ? fromNumericString(document.netAmount, cash.currency) : null;
  const taxDoc = document.taxAmount ? fromNumericString(document.taxAmount, cash.currency) : null;
  if (!grossDoc || !netDoc || !taxDoc || isZeroMoney(taxDoc) || compareMoney(netDoc, grossDoc) === 0) {
    return noVatTriplet(cash);
  }
  if (compareMoney(cash, grossDoc) === 0) {
    return { net: netDoc, vat: taxDoc, gross: grossDoc };
  }
  return tripletFromGross(cash, {
    totalAmount: grossDoc,
    subtotalAmount: netDoc,
    taxAmount: taxDoc,
  });
}

export function apPaymentDisplay(input: {
  readonly amount: MoneyValue;
  readonly applications: readonly {
    readonly appliedAmount: string;
    readonly currency: string;
    readonly netAmount: string;
    readonly taxAmount: string;
    readonly grossAmount: string;
  }[];
}): RevenueTriplet {
  if (input.applications.length === 0) return noVatTriplet(input.amount);
  let display = zeroTriplet(input.amount.currency);
  let applied = zeroMoney(input.amount.currency);
  for (const app of input.applications) {
    if (app.currency.toUpperCase() !== input.amount.currency.toUpperCase()) continue;
    const slice = fromNumericString(app.appliedAmount, app.currency);
    if (!slice || !isPositiveMoney(slice)) continue;
    display = addTriplets(
      display,
      documentCashTriplet(slice, {
        netAmount: app.netAmount,
        taxAmount: app.taxAmount,
        grossAmount: app.grossAmount,
      }),
    );
    applied = addMoney(applied, slice);
  }
  const unallocated = subtractMoney(input.amount, applied);
  if (isPositiveMoney(unallocated)) {
    display = addTriplets(display, noVatTriplet(unallocated));
  }
  return display;
}

function paidDisplay(line: MonthCashPaidLine): RevenueTriplet {
  return line.display ?? noVatTriplet(line.amount);
}

function expectedDisplay(line: MonthCashExpectedLine): RevenueTriplet {
  return line.display ?? noVatTriplet(line.remaining);
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
        display: documentCashTriplet(paid, row),
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
        display: documentCashTriplet(remaining, row),
        status: isPositiveMoney(paid) ? 'partial' : 'unpaid',
      });
    }
    return { paid: paidLines, expected: expectedLines };
  }

  const schedule = resolveCashInstallmentLines({
    totalGross: total,
    installmentCount: row.installmentCount,
    startDate: row.installmentStartDate ?? row.expenseDate,
    stored: row.cashInstallmentSchedule,
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
      display: documentCashTriplet(line.amount, row),
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
      display: documentCashTriplet(extra, row),
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
      display: documentCashTriplet(remaining, row),
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
  /** Stored collection NET / VAT / GROSS. Omitted means the cash total has no VAT. */
  readonly collectionsDisplay?: RevenueTriplet;
  readonly apPayments: readonly MonthCashPaidLine[];
  readonly apExpected: readonly MonthCashExpectedLine[];
  readonly expenses: readonly MonthExpenseCashSnapshot[];
  readonly payroll: readonly MonthPayrollCashSnapshot[];
  readonly advances: readonly MonthAdvanceCashSnapshot[];
}): MonthCashFlow {
  const currency = input.currency.toUpperCase();
  const paid: MonthCashPaidLine[] = [];
  const expected: MonthCashExpectedLine[] = [];
  // Same canonical line id only. Free text, amounts, and dates never collapse rows.
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
        display: noVatTriplet(paidAmount),
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
        display: noVatTriplet(remaining),
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
      display: noVatTriplet(amount),
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
  const collectionsDisplay =
    input.collectionsDisplay && sameCurrency(input.collectionsDisplay.gross, currency)
      ? input.collectionsDisplay
      : noVatTriplet(collections);
  const paidDisplayTotal = sumTriplets(paid.map(paidDisplay), currency);
  const expectedDisplayTotal = sumTriplets(expected.map(expectedDisplay), currency);
  const netCashDisplay = subtractTriplets(collectionsDisplay, paidDisplayTotal);
  const forecastDisplay = subtractTriplets(netCashDisplay, expectedDisplayTotal);

  return {
    collectionsActual: collections,
    paidActual,
    expectedOutgoing,
    netCash,
    forecastAfterRemaining,
    paidLines: paid,
    expectedLines: expected,
    display: {
      collections: collectionsDisplay,
      paid: paidDisplayTotal,
      expected: expectedDisplayTotal,
      netCash: netCashDisplay,
      forecast: forecastDisplay,
    },
  };
}
