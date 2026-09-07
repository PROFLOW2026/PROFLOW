/**
 * Canonical expense cash payment obligation — single source for payable amount,
 * effective due date, and installment progress. Payment ≠ Actual (managerial spread).
 */

import type { BusinessDate } from '@/shared/dates';
import { compareBusinessDates } from '@/shared/dates';
import type { MoneyValue } from '@/shared/money';
import {
  addMoney,
  fromNumericString,
  isPositiveMoney,
  subtractMoney,
  toNumericString,
  zeroMoney,
} from '@/shared/money';
import type { ExpensePaymentStatus } from '@/modules/tenancy/domain/org-financial-policies';
import { resolveExpensePaymentStatus } from '@/modules/tenancy/domain/org-financial-policies';
import {
  buildCashInstallmentSchedule,
  type CashInstallmentLine,
} from './cash-installment-schedule';

export interface ExpensePaymentObligationInput {
  readonly grossAmount: string;
  readonly currency: string;
  readonly expenseDate: BusinessDate;
  readonly installmentCount: number;
  readonly installmentStartDate: BusinessDate | null;
  readonly installmentsPaidCount: number;
  readonly paidGrossAmount: string | null;
  readonly dueDate: BusinessDate | null;
  readonly paymentStatus: ExpensePaymentStatus | string | null;
  readonly paidAt: BusinessDate | null;
}

export interface ResolvedExpensePaymentObligation {
  readonly transactionTotal: MoneyValue;
  readonly totalPaid: MoneyValue;
  readonly totalRemaining: MoneyValue;
  /** Amount due now — current installment remainder, or single-payment remainder. */
  readonly payableAmount: MoneyValue;
  readonly effectiveDueDate: BusinessDate | null;
  readonly currentInstallmentIndex: number | null;
  readonly currentInstallmentAmount: MoneyValue | null;
  readonly installmentSchedule: readonly CashInstallmentLine[];
  readonly isFullyPaid: boolean;
  readonly paymentStatus: ExpensePaymentStatus | null;
}

function paidTotal(input: ExpensePaymentObligationInput): MoneyValue {
  return fromNumericString(input.paidGrossAmount ?? '0', input.currency) ?? zeroMoney(input.currency);
}

function transactionTotal(input: ExpensePaymentObligationInput): MoneyValue {
  return fromNumericString(input.grossAmount, input.currency) ?? zeroMoney(input.currency);
}

function scheduleFor(input: ExpensePaymentObligationInput): readonly CashInstallmentLine[] {
  const total = transactionTotal(input);
  if (!isPositiveMoney(total) || input.installmentCount <= 1) return [];
  return buildCashInstallmentSchedule({
    totalGross: total,
    installmentCount: input.installmentCount,
    startDate: input.installmentStartDate ?? input.expenseDate,
  });
}

function findCurrentInstallmentIndex(
  schedule: readonly CashInstallmentLine[],
  installmentsPaidCount: number,
): number {
  if (schedule.length === 0) return 0;
  return Math.min(installmentsPaidCount, schedule.length - 1);
}

function paidBeforeInstallment(
  schedule: readonly CashInstallmentLine[],
  installmentIndex: number,
  currency: string,
): MoneyValue {
  let total = zeroMoney(currency);
  for (let i = 0; i < installmentIndex; i += 1) {
    const line = schedule[i];
    if (line) total = addMoney(total, line.amount);
  }
  return total;
}

export function resolveExpensePaymentObligation(
  input: ExpensePaymentObligationInput,
  today: BusinessDate,
): ResolvedExpensePaymentObligation {
  const total = transactionTotal(input);
  const paid = paidTotal(input);
  const totalRemaining = subtractMoney(total, paid);
  const schedule = scheduleFor(input);

  if (input.installmentCount <= 1 || schedule.length === 0) {
    const payableAmount = isPositiveMoney(totalRemaining) ? totalRemaining : zeroMoney(input.currency);
    const isFullyPaid = isPositiveMoney(total) && !isPositiveMoney(totalRemaining);
    const effectiveDueDate = isFullyPaid ? null : input.dueDate;
    const paymentStatus = isFullyPaid
      ? 'paid'
      : resolveExpensePaymentStatus({
          paymentStatus: input.paymentStatus as ExpensePaymentStatus | null,
          dueDate: effectiveDueDate,
          paidAt: input.paidAt,
          today,
        });

    return {
      transactionTotal: total,
      totalPaid: paid,
      totalRemaining: isPositiveMoney(totalRemaining) ? totalRemaining : zeroMoney(input.currency),
      payableAmount,
      effectiveDueDate,
      currentInstallmentIndex: null,
      currentInstallmentAmount: null,
      installmentSchedule: schedule,
      isFullyPaid,
      paymentStatus,
    };
  }

  const currentIndex = findCurrentInstallmentIndex(schedule, input.installmentsPaidCount);
  const currentLine = schedule[currentIndex] ?? null;
  const priorPaid = paidBeforeInstallment(schedule, currentIndex, input.currency);
  const paidOnCurrent = subtractMoney(paid, priorPaid);
  const currentInstallmentAmount = currentLine?.amount ?? zeroMoney(input.currency);
  const payableOnCurrent = subtractMoney(currentInstallmentAmount, paidOnCurrent);
  const payableAmount = isPositiveMoney(payableOnCurrent)
    ? payableOnCurrent
    : zeroMoney(input.currency);

  const allInstallmentsPaid = input.installmentsPaidCount >= input.installmentCount;
  const isFullyPaid = allInstallmentsPaid && !isPositiveMoney(totalRemaining);

  const effectiveLine = isFullyPaid ? null : currentLine;
  const effectiveDueDate = isFullyPaid ? null : (effectiveLine?.dueDate ?? input.dueDate);

  const paymentStatus = isFullyPaid
    ? 'paid'
    : resolveExpensePaymentStatus({
        paymentStatus: input.paymentStatus as ExpensePaymentStatus | null,
        dueDate: effectiveDueDate,
        paidAt: input.paidAt,
        today,
      });

  return {
    transactionTotal: total,
    totalPaid: paid,
    totalRemaining: isPositiveMoney(totalRemaining) ? totalRemaining : zeroMoney(input.currency),
    payableAmount: isFullyPaid ? zeroMoney(input.currency) : payableAmount,
    effectiveDueDate,
    currentInstallmentIndex: isFullyPaid ? null : currentIndex,
    currentInstallmentAmount: effectiveLine?.amount ?? null,
    installmentSchedule: schedule,
    isFullyPaid,
    paymentStatus,
  };
}

export function obligationAlertSourceId(
  expenseId: string,
  obligation: Pick<ResolvedExpensePaymentObligation, 'currentInstallmentIndex'>,
): string {
  if (obligation.currentInstallmentIndex == null) return expenseId;
  return `${expenseId}:inst-${obligation.currentInstallmentIndex}`;
}

export function isObligationActionable(
  obligation: ResolvedExpensePaymentObligation,
  today: BusinessDate,
): boolean {
  if (obligation.isFullyPaid || !isPositiveMoney(obligation.payableAmount)) return false;
  if (!obligation.effectiveDueDate) return true;
  return compareBusinessDates(obligation.effectiveDueDate, today) <= 0;
}

export function isObligationUpcoming(
  obligation: ResolvedExpensePaymentObligation,
  today: BusinessDate,
): boolean {
  if (obligation.isFullyPaid || !obligation.effectiveDueDate) return false;
  return compareBusinessDates(obligation.effectiveDueDate, today) > 0;
}

export function formatObligationAmount(amount: MoneyValue): string {
  return toNumericString(amount);
}
