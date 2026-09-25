/**
 * Cash installment due dates — distinct from managerial Actual spread.
 */

import type { BusinessDate } from '@/shared/dates';
import { businessDate } from '@/shared/dates';
import type { MoneyValue } from '@/shared/money';
import {
  addMoney,
  money,
  roundMoney,
  subtractMoney,
  sumMoney,
  toDecimalValue,
  toNumericString,
  zeroMoney,
} from '@/shared/money';
import { DomainRuleError } from '@/shared/errors';

export interface CashInstallmentLine {
  readonly dueDate: BusinessDate;
  readonly amount: MoneyValue;
  readonly index: number;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseDateParts(date: BusinessDate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

/** Preserve day-of-month when adding calendar months (clamped to month length). */
export function addCalendarMonthsToDate(date: BusinessDate, offset: number): BusinessDate {
  const { year, month, day } = parseDateParts(date);
  const absolute = year * 12 + (month - 1) + offset;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = (absolute % 12) + 1;
  const clampedDay = Math.min(day, daysInMonth(nextYear, nextMonth));
  return businessDate(
    `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`,
  );
}

/** Next calendar occurrence of day-of-month on or after baseDate. */
export function nextOccurrenceOfDayOfMonth(
  baseDate: BusinessDate,
  dayOfMonth: number,
): BusinessDate {
  const day = Math.min(Math.max(Math.trunc(dayOfMonth), 1), 28);
  const { year, month } = parseDateParts(baseDate);
  const clamped = Math.min(day, daysInMonth(year, month));
  const candidate = businessDate(
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`,
  );
  if (candidate >= baseDate) return candidate;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextClamped = Math.min(day, daysInMonth(nextYear, nextMonth));
  return businessDate(
    `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-${String(nextClamped).padStart(2, '0')}`,
  );
}

export interface StoredCashInstallmentLine {
  readonly dueDate: string;
  readonly amount: string;
}

export interface StoredCashInstallmentSchedule {
  readonly interval: 'monthly';
  readonly lines: readonly StoredCashInstallmentLine[];
}

/** Cash installments do not spread recognized NET. Legacy rows without this payload still do. */
export function managerialRecognitionCount(input: {
  readonly installmentCount: number;
  readonly cashInstallmentSchedule: unknown;
}): number {
  if (input.cashInstallmentSchedule) return 1;
  const count = input.installmentCount;
  return Number.isInteger(count) && count >= 1 ? count : 1;
}

export function parseStoredCashInstallmentSchedule(
  value: unknown,
): StoredCashInstallmentSchedule | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { interval?: unknown; lines?: unknown };
  if (record.interval !== 'monthly' || !Array.isArray(record.lines)) return null;
  const lines: StoredCashInstallmentLine[] = [];
  for (const line of record.lines) {
    if (!line || typeof line !== 'object') return null;
    const dueDate = (line as { dueDate?: unknown }).dueDate;
    const amount = (line as { amount?: unknown }).amount;
    if (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
    if (typeof amount !== 'string' || !amount.trim()) return null;
    lines.push({ dueDate, amount: amount.trim() });
  }
  if (lines.length < 2 || lines.length > 120) return null;
  return { interval: 'monthly', lines };
}

function linesFromStored(
  stored: StoredCashInstallmentSchedule,
  currency: string,
): readonly CashInstallmentLine[] {
  return stored.lines.map((line, index) => {
    const amount = roundMoney(money(line.amount, currency));
    if (toDecimalValue(amount).lte(0)) {
      throw new DomainRuleError(
        'Installment amount must be positive',
        'expenses.errors.installmentTotal',
      );
    }
    return {
      dueDate: businessDate(line.dueDate),
      amount,
      index,
    };
  });
}

export function assertCashInstallmentTotal(input: {
  readonly lines: readonly CashInstallmentLine[];
  readonly totalGross: MoneyValue;
}): void {
  const sum = roundMoney(sumMoney(input.lines.map((line) => line.amount), input.totalGross.currency));
  if (toNumericString(sum) !== toNumericString(roundMoney(input.totalGross))) {
    throw new DomainRuleError(
      `Installment schedule does not match payable total: ${sum.amount} != ${input.totalGross.amount}`,
      'expenses.errors.installmentSumMismatch',
    );
  }
}

/** Paid prefix is cash history. Later lines may change. */
export function assertPaidInstallmentsUnchanged(input: {
  readonly previous: readonly CashInstallmentLine[];
  readonly next: readonly CashInstallmentLine[];
  readonly installmentsPaidCount: number;
}): void {
  const paidCount = input.installmentsPaidCount;
  if (paidCount <= 0) return;
  if (input.next.length < paidCount) {
    throw new DomainRuleError(
      'Paid installments cannot be removed',
      'expenses.errors.paidInstallmentImmutable',
    );
  }
  for (let index = 0; index < paidCount; index += 1) {
    const before = input.previous[index];
    const after = input.next[index];
    if (!before || !after) {
      throw new DomainRuleError(
        'Paid installments cannot be rewritten',
        'expenses.errors.paidInstallmentImmutable',
      );
    }
    if (
      before.dueDate !== after.dueDate ||
      toNumericString(before.amount) !== toNumericString(after.amount)
    ) {
      throw new DomainRuleError(
        'Paid installments cannot be rewritten',
        'expenses.errors.paidInstallmentImmutable',
      );
    }
  }
}

/**
 * Stored lines are the cash schedule when present.
 * Otherwise equal monthly lines from count + start date (existing engine).
 */
export function resolveCashInstallmentLines(input: {
  readonly totalGross: MoneyValue;
  readonly installmentCount: number;
  readonly startDate: BusinessDate;
  readonly stored?: unknown;
}): readonly CashInstallmentLine[] {
  if (input.installmentCount <= 1) return [];
  const stored = parseStoredCashInstallmentSchedule(input.stored);
  if (stored) {
    const lines = linesFromStored(stored, input.totalGross.currency);
    assertCashInstallmentTotal({ lines, totalGross: input.totalGross });
    return lines;
  }
  return buildCashInstallmentSchedule({
    totalGross: input.totalGross,
    installmentCount: input.installmentCount,
    startDate: input.startDate,
  });
}

export function cashInstallmentFieldsForSave(input: {
  readonly paymentStructure?: 'single' | 'installments' | null;
  readonly cashInstallmentSchedule?: unknown;
  readonly installmentCount?: number | null;
  readonly installmentStartDate?: string | null;
  readonly gross: MoneyValue;
}): {
  readonly installmentCount: number;
  readonly installmentStartDate: BusinessDate | null;
  readonly cashInstallmentSchedule: StoredCashInstallmentSchedule | null;
  readonly replacesPaymentTerms: boolean;
  readonly dueDate: BusinessDate | null;
} {
  if (input.paymentStructure === 'single') {
    return {
      installmentCount: 1,
      installmentStartDate: null,
      cashInstallmentSchedule: null,
      replacesPaymentTerms: false,
      dueDate: null,
    };
  }

  if (input.paymentStructure === 'installments') {
    const stored = parseStoredCashInstallmentSchedule(input.cashInstallmentSchedule);
    if (!stored) {
      throw new DomainRuleError(
        'Installment schedule is required',
        'expenses.errors.installmentScheduleRequired',
      );
    }
    const lines = linesFromStored(stored, input.gross.currency);
    assertCashInstallmentTotal({ lines, totalGross: input.gross });
    const first = lines[0]!.dueDate;
    return {
      installmentCount: lines.length,
      installmentStartDate: first,
      cashInstallmentSchedule: {
        interval: 'monthly',
        lines: lines.map((line) => ({
          dueDate: line.dueDate,
          amount: toNumericString(line.amount),
        })),
      },
      replacesPaymentTerms: true,
      dueDate: first,
    };
  }

  const count = input.installmentCount && input.installmentCount >= 1 ? input.installmentCount : 1;
  return {
    installmentCount: count,
    installmentStartDate: input.installmentStartDate
      ? businessDate(input.installmentStartDate)
      : null,
    cashInstallmentSchedule: null,
    replacesPaymentTerms: false,
    dueDate: null,
  };
}

export function assertCashScheduleEditPreservesPaid(input: {
  readonly installmentsPaidCount: number;
  readonly currency: string;
  readonly previousGross: string;
  readonly previousCount: number;
  readonly previousStart: BusinessDate;
  readonly previousStored: unknown;
  readonly nextGross: MoneyValue;
  readonly nextCount: number;
  readonly nextStart: BusinessDate | null;
  readonly nextStored: unknown;
}): void {
  if (input.installmentsPaidCount <= 0) return;
  const previous = resolveCashInstallmentLines({
    totalGross: money(input.previousGross, input.currency),
    installmentCount: input.previousCount,
    startDate: input.previousStart,
    stored: input.previousStored,
  });
  const next =
    input.nextCount <= 1 || !input.nextStart
      ? []
      : resolveCashInstallmentLines({
          totalGross: input.nextGross,
          installmentCount: input.nextCount,
          startDate: input.nextStart,
          stored: input.nextStored,
        });
  assertPaidInstallmentsUnchanged({
    previous,
    next,
    installmentsPaidCount: input.installmentsPaidCount,
  });
}

/** Equal gross installments with residual on the last line. */
export function buildCashInstallmentSchedule(input: {
  readonly totalGross: MoneyValue;
  readonly installmentCount: number;
  readonly startDate: BusinessDate;
}): readonly CashInstallmentLine[] {
  const count = input.installmentCount;
  if (!Number.isInteger(count) || count < 1 || count > 120) {
    throw new DomainRuleError(
      'Installment count must be between 1 and 120',
      'expenses.errors.installmentCountRange',
    );
  }
  const total = roundMoney(input.totalGross);
  if (toDecimalValue(total).lte(0)) {
    throw new DomainRuleError('Installment total must be positive', 'expenses.errors.installmentTotal');
  }

  if (count === 1) {
    return [{ dueDate: input.startDate, amount: total, index: 0 }];
  }

  const rawShare = toDecimalValue(total).dividedBy(count);
  const amounts: MoneyValue[] = [];
  for (let i = 0; i < count; i += 1) {
    amounts.push(roundMoney(money(rawShare.toFixed(6), total.currency)));
  }
  const sum = sumMoney(amounts, total.currency);
  if (toNumericString(sum) !== toNumericString(total)) {
    amounts[count - 1] = addMoney(amounts[count - 1]!, subtractMoney(total, sum));
  }

  return amounts.map((amount, index) => ({
    dueDate: addCalendarMonthsToDate(input.startDate, index),
    amount: roundMoney(amount),
    index,
  }));
}

export function installmentCashInDateRange(input: {
  readonly schedule: readonly CashInstallmentLine[];
  readonly installmentsPaidCount: number;
  readonly fromDate: BusinessDate;
  readonly toDate: BusinessDate;
  readonly currency: string;
}): MoneyValue {
  let total = money('0', input.currency);
  for (let i = 0; i < input.installmentsPaidCount; i += 1) {
    const line = input.schedule[i];
    if (!line) continue;
    if (line.dueDate >= input.fromDate && line.dueDate <= input.toDate) {
      total = addMoney(total, line.amount);
    }
  }
  return total;
}

/** Derive fully-paid installment count from cumulative paid gross (sequential schedule). */
export function installmentsPaidCountFromPaidGross(input: {
  readonly schedule: readonly CashInstallmentLine[];
  readonly paidGross: MoneyValue;
}): number {
  let cumulative = zeroMoney(input.paidGross.currency);
  let count = 0;
  for (let index = 0; index < input.schedule.length; index += 1) {
    const line = input.schedule[index];
    if (!line) break;
    cumulative = addMoney(cumulative, line.amount);
    if (Number(input.paidGross.amount) + 0.000001 >= Number(cumulative.amount)) {
      count = index + 1;
    } else {
      break;
    }
  }
  return count;
}
