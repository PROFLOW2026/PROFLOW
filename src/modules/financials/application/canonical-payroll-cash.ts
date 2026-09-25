/**
 * Canonical payroll cash — owner-entered employee_month_costs actual_amount
 * takes precedence over employee_payroll_payments for the same employee-month.
 */

import type { DbExecutor } from '@/shared/db/types';
import type { BusinessDate } from '@/shared/dates';
import {
  addMoney,
  fromNumericString,
  isPositiveMoney,
  roundMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import {
  loadAllOwnerActualEmployeePayrollCash,
  loadAllPayrollCashSnapshots,
  loadMonthOwnerActualEmployeePayrollCash,
  loadMonthPayrollCashSnapshots,
} from '../data/month-cash-flow.repository';
import type { MonthPayrollCashSnapshot } from '../domain/month-cash-flow';
import { mergePayrollCashSources } from './merge-payroll-cash-sources';

export async function loadCanonicalPayrollCashSnapshots(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  input: {
    readonly salaryPaymentDay: number;
    readonly from?: BusinessDate;
    readonly to?: BusinessDate;
  },
): Promise<readonly MonthPayrollCashSnapshot[]> {
  const [ownerActual, paymentConfirmed] = await Promise.all([
    input.from != null && input.to != null
      ? loadMonthOwnerActualEmployeePayrollCash(
          db,
          organizationId,
          currency,
          input.from,
          input.to,
          input.salaryPaymentDay,
        )
      : loadAllOwnerActualEmployeePayrollCash(
          db,
          organizationId,
          currency,
          input.salaryPaymentDay,
        ),
    input.from != null && input.to != null
      ? loadMonthPayrollCashSnapshots(db, organizationId, currency, input.from, input.to)
      : loadAllPayrollCashSnapshots(db, organizationId, currency),
  ]);

  return mergePayrollCashSources({ ownerActual, paymentConfirmed });
}

export function sumPayrollSnapshotsPaid(
  snapshots: readonly MonthPayrollCashSnapshot[],
  currency: string,
  range?: { readonly from: BusinessDate; readonly to: BusinessDate },
): MoneyValue {
  let total = zeroMoney(currency);
  for (const row of snapshots) {
    if (row.voided || row.currency.toUpperCase() !== currency.toUpperCase()) continue;
    const paidAmount = fromNumericString(row.paidAmount ?? '0', currency);
    if (!paidAmount || !isPositiveMoney(paidAmount)) continue;
    if (range) {
      if (!row.paidAt || row.paidAt < range.from || row.paidAt > range.to) continue;
    } else if (!row.paidAt) {
      continue;
    }
    total = addMoney(total, paidAmount);
  }
  return roundMoney(total);
}

export function sumPayrollSnapshotsOutstanding(
  snapshots: readonly MonthPayrollCashSnapshot[],
  currency: string,
): MoneyValue {
  let total = zeroMoney(currency);
  for (const row of snapshots) {
    if (row.voided || row.currency.toUpperCase() !== currency.toUpperCase()) continue;
    if (row.paidAt) continue;
    const expected = fromNumericString(row.expectedAmount, currency) ?? zeroMoney(currency);
    if (!isPositiveMoney(expected)) continue;
    total = addMoney(total, expected);
  }
  return roundMoney(total);
}

export async function sumCanonicalPayrollCashPaid(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  input: {
    readonly salaryPaymentDay: number;
    readonly from?: BusinessDate;
    readonly to?: BusinessDate;
  },
): Promise<MoneyValue> {
  const snapshots = await loadCanonicalPayrollCashSnapshots(db, organizationId, currency, input);
  return sumPayrollSnapshotsPaid(
    snapshots,
    currency,
    input.from != null && input.to != null ? { from: input.from, to: input.to } : undefined,
  );
}

export async function sumCanonicalPayrollCashOutstanding(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  salaryPaymentDay: number,
): Promise<MoneyValue> {
  const snapshots = await loadCanonicalPayrollCashSnapshots(db, organizationId, currency, {
    salaryPaymentDay,
  });
  return sumPayrollSnapshotsOutstanding(snapshots, currency);
}
