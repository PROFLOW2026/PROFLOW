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
