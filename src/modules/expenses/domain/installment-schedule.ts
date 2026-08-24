/**
 * Managerial installment schedule — Owner-defined monthly Actual spread.
 * Payment ≠ Actual. Total NET = Σ monthly portions (exact conservation).
 */

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

export interface InstallmentScheduleLine {
  readonly yearMonth: string;
  readonly amount: MoneyValue;
  readonly sortOrder: number;
}

export interface InstallmentSchedule {
  readonly lines: readonly InstallmentScheduleLine[];
  readonly total: MoneyValue;
  readonly installmentCount: number;
  readonly startYearMonth: string;
}

function assertYearMonth(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) {
    throw new DomainRuleError('Invalid year-month', 'expenses.errors.invalidYearMonth');
  }
  const month = Number(trimmed.slice(5, 7));
  if (month < 1 || month > 12) {
    throw new DomainRuleError('Invalid year-month', 'expenses.errors.invalidYearMonth');
  }
  return trimmed;
}

export function yearMonthFromBusinessDate(date: string): string {
  const trimmed = date.trim();
  if (trimmed.length < 7) {
    throw new DomainRuleError('Invalid date', 'expenses.errors.invalidDate');
  }
  return assertYearMonth(trimmed.slice(0, 7));
}

export function addCalendarMonths(yearMonth: string, offset: number): string {
  const ym = assertYearMonth(yearMonth);
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const absolute = year * 12 + (month - 1) + offset;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = (absolute % 12) + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

/**
 * Build equal installment lines with residual on the last month.
 * Example: 10000 / 3 → 3333.33, 3333.33, 3333.34
 */
export function buildEqualInstallmentSchedule(input: {
  readonly totalNet: MoneyValue;
  readonly installmentCount: number;
  readonly startYearMonth: string;
}): InstallmentSchedule {
  const count = input.installmentCount;
  if (!Number.isInteger(count) || count < 1 || count > 120) {
    throw new DomainRuleError(
      'Installment count must be between 1 and 120',
      'expenses.errors.installmentCountRange',
    );
  }
  const startYearMonth = assertYearMonth(input.startYearMonth);
  const total = roundMoney(input.totalNet);
  if (toDecimalValue(total).lte(0)) {
    throw new DomainRuleError('Installment total must be positive', 'expenses.errors.installmentTotal');
  }

  if (count === 1) {
    return {
      lines: [{ yearMonth: startYearMonth, amount: total, sortOrder: 0 }],
      total,
      installmentCount: 1,
      startYearMonth,
    };
  }

  const rawShare = toDecimalValue(total).dividedBy(count);
  const amounts: MoneyValue[] = [];
  for (let i = 0; i < count; i += 1) {
    amounts.push(roundMoney(money(rawShare.toFixed(6), total.currency)));
  }
  const sum = sumMoney(amounts, total.currency);
  if (toNumericString(sum) !== toNumericString(total)) {
    const residue = subtractMoney(total, sum);
    amounts[count - 1] = addMoney(amounts[count - 1]!, residue);
  }

  const lines: InstallmentScheduleLine[] = amounts.map((amount, index) => ({
    yearMonth: addCalendarMonths(startYearMonth, index),
    amount: roundMoney(amount),
    sortOrder: index,
  }));

  return {
    lines,
    total: roundMoney(sumMoney(lines.map((l) => l.amount), total.currency)),
    installmentCount: count,
    startYearMonth,
  };
}

export function assertInstallmentScheduleConserves(
  schedule: InstallmentSchedule,
  expectedTotal: MoneyValue,
): void {
  const sum = roundMoney(sumMoney(schedule.lines.map((l) => l.amount), expectedTotal.currency));
  if (toNumericString(sum) !== toNumericString(roundMoney(expectedTotal))) {
    throw new DomainRuleError(
      `Installment schedule does not conserve: ${sum.amount} != ${expectedTotal.amount}`,
      'expenses.errors.installmentConservation',
    );
  }
}

/** Amount recognized for a given year-month from schedule lines (0 if none). */
export function installmentAmountForMonth(
  schedule: InstallmentSchedule,
  yearMonth: string,
): MoneyValue {
  const ym = assertYearMonth(yearMonth);
  const line = schedule.lines.find((l) => l.yearMonth === ym);
  return line?.amount ?? money('0', schedule.total.currency);
}

export function recognizedInstallmentToDate(
  schedule: InstallmentSchedule,
  throughYearMonth: string,
): MoneyValue {
  const through = assertYearMonth(throughYearMonth);
  const values = schedule.lines
    .filter((l) => l.yearMonth <= through)
    .map((l) => l.amount);
  return values.length === 0
    ? money('0', schedule.total.currency)
    : roundMoney(sumMoney(values, schedule.total.currency));
}

export function remainingInstallmentAfter(
  schedule: InstallmentSchedule,
  throughYearMonth: string,
): MoneyValue {
  return subtractMoney(schedule.total, recognizedInstallmentToDate(schedule, throughYearMonth));
}

/** Exposed for tests — Decimal share before residual. */
export function installmentRawShare(total: MoneyValue, count: number) {
  return toDecimalValue(total).dividedBy(count);
}
