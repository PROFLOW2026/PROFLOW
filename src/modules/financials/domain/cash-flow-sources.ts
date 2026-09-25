/**
 * Extra cash-forecast lines: operating expense dues, payroll obligations, open commitments.
 * Cash only — not profit and not Actual cost.
 */

import type { BusinessDate } from '@/shared/dates';
import { isPositiveMoney, isZeroMoney, money, type MoneyValue } from '@/shared/money';
import { resolveExpensePaymentObligation } from '@/modules/expenses/domain/resolve-expense-payment-obligation';
import {
  certaintyForDatedSource,
  type CashFlowForecastItem,
} from './cash-flow-forecast';

export interface OperatingExpenseCashRow {
  readonly id: string;
  readonly description: string | null;
  readonly projectId: string | null;
  readonly grossAmount: string;
  readonly currency: string;
  readonly expenseDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly installmentCount: number;
  readonly installmentStartDate: BusinessDate | null;
  readonly installmentsPaidCount: number;
  readonly paidGrossAmount: string | null;
  readonly paymentStatus: string | null;
  readonly paidAt: BusinessDate | null;
}

export interface PayrollObligationCashRow {
  readonly id: string;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly yearMonth: string;
  readonly expectedAmount: string;
  readonly currency: string;
  readonly dueDate: BusinessDate | null;
}

export interface OpenCommitmentCashRow {
  readonly id: string;
  readonly purchaseOrderId: string;
  readonly reference: string | null;
  readonly projectId: string | null;
  readonly amount: string;
  readonly currency: string;
}

function sameCurrency(amount: MoneyValue, currency: string): boolean {
  return amount.currency.toUpperCase() === currency.toUpperCase();
}

/** Remaining cash installments. Managerial NET spread is not included. */
export function operatingExpenseCashItems(
  rows: readonly OperatingExpenseCashRow[],
  currency: string,
  today: BusinessDate,
): CashFlowForecastItem[] {
  const items: CashFlowForecastItem[] = [];
  for (const row of rows) {
    if (row.currency.toUpperCase() !== currency.toUpperCase()) continue;
    const obligation = resolveExpensePaymentObligation(
      {
        grossAmount: row.grossAmount,
        currency: row.currency,
        expenseDate: row.expenseDate,
        installmentCount: row.installmentCount,
        installmentStartDate: row.installmentStartDate,
        installmentsPaidCount: row.installmentsPaidCount,
        paidGrossAmount: row.paidGrossAmount,
        dueDate: row.dueDate,
        paymentStatus: row.paymentStatus,
        paidAt: row.paidAt,
      },
      today,
    );
    if (obligation.isFullyPaid) continue;
    const label = row.description?.trim() || row.id;
    const schedule = obligation.installmentSchedule;
    if (schedule.length <= 1) {
      if (!isPositiveMoney(obligation.payableAmount) || !sameCurrency(obligation.payableAmount, currency)) {
        continue;
      }
      items.push({
        id: `expense:${row.id}`,
        href: `/expenses/${row.id}`,
        label,
        amount: obligation.payableAmount,
        dueDate: obligation.effectiveDueDate,
        certainty: certaintyForDatedSource({
          dueDate: obligation.effectiveDueDate,
          recorded: true,
        }),
        direction: 'out',
        sourceType: 'operating_expense',
        projectId: row.projectId,
      });
      continue;
    }

    const startIndex = obligation.currentInstallmentIndex ?? 0;
    for (let index = startIndex; index < schedule.length; index += 1) {
      const line = schedule[index];
      if (!line) continue;
      const amount = index === startIndex ? obligation.payableAmount : line.amount;
      if (!isPositiveMoney(amount) || !sameCurrency(amount, currency)) continue;
      items.push({
        id: `expense:${row.id}:inst-${index}`,
        href: `/expenses/${row.id}`,
        label,
        amount,
        dueDate: line.dueDate,
        certainty: certaintyForDatedSource({ dueDate: line.dueDate, recorded: true }),
        direction: 'out',
        sourceType: 'operating_expense',
        projectId: row.projectId,
      });
    }
  }
  return items;
}

/** Unpaid payroll obligations. Employer cost recognition is not added again. */
export function payrollObligationCashItems(
  rows: readonly PayrollObligationCashRow[],
  currency: string,
): CashFlowForecastItem[] {
  const items: CashFlowForecastItem[] = [];
  for (const row of rows) {
    if (row.currency.toUpperCase() !== currency.toUpperCase()) continue;
    let amount: MoneyValue;
    try {
      amount = money(row.expectedAmount, row.currency);
    } catch {
      continue;
    }
    if (!isPositiveMoney(amount) || isZeroMoney(amount)) continue;
    const who = row.employeeName.trim() || row.yearMonth;
    items.push({
      id: `payroll:${row.id}`,
      href: `/workforce/employees/${row.employeeId}`,
      label: `${who} · ${row.yearMonth}`,
      amount,
      dueDate: row.dueDate,
      certainty: certaintyForDatedSource({ dueDate: row.dueDate, recorded: true }),
      direction: 'out',
      sourceType: 'payroll_obligation',
      projectId: null,
    });
  }
  return items;
}

/**
 * Open PO commitments have no cash due date. They stay undated so the source is
 * visible without inventing a payment day.
 */
export function openCommitmentCashItems(
  rows: readonly OpenCommitmentCashRow[],
  currency: string,
): CashFlowForecastItem[] {
  const items: CashFlowForecastItem[] = [];
  for (const row of rows) {
    if (row.currency.toUpperCase() !== currency.toUpperCase()) continue;
    let amount: MoneyValue;
    try {
      amount = money(row.amount, row.currency);
    } catch {
      continue;
    }
    if (!isPositiveMoney(amount)) continue;
    items.push({
      id: `commitment:${row.id}`,
      href: `/procurement/${row.purchaseOrderId}`,
      label: row.reference?.trim() || row.purchaseOrderId,
      amount,
      dueDate: null,
      certainty: 'uncertain',
      direction: 'out',
      sourceType: 'commitment',
      projectId: row.projectId,
    });
  }
  return items;
}
