/**
 * Verified installment payment slices — actual paid date must come from audit or stored schedule paidAt,
 * never from due_date alone.
 */

import { yearMonthFromBusinessDate } from '@/modules/month-close';
import { businessDate, type BusinessDate } from '@/shared/dates';
import {
  fromNumericString,
  isPositiveMoney,
  isZeroMoney,
  money,
  roundMoney,
  type MoneyValue,
} from '@/shared/money';
import {
  parseStoredCashInstallmentSchedule,
  resolveCashInstallmentLines,
} from './cash-installment-schedule';

export type InstallmentPaymentVerification = 'verified' | 'not_verified';

export interface VerifiedInstallmentPayment {
  readonly installmentIndex: number;
  readonly dueDate: BusinessDate;
  readonly actualPaidAt: BusinessDate;
  readonly grossPaid: MoneyValue;
  readonly verification: InstallmentPaymentVerification;
  readonly source: 'audit' | 'stored_schedule' | 'ledger';
  readonly paymentReference?: string | null;
}

export interface ExpensePaymentAuditRow {
  readonly action: string;
  readonly createdAt: string;
  readonly after: unknown;
}

function readAuditPaymentSlice(after: unknown): {
  readonly paidAt: string | null;
  readonly grossPaid: string | null;
  readonly installmentIndex: number | null;
  readonly source: string | null;
} | null {
  if (!after || typeof after !== 'object') return null;
  const record = after as Record<string, unknown>;
  const paidAt = typeof record.paidAt === 'string' ? record.paidAt : null;
  const grossPaid =
    typeof record.paidGrossAmount === 'string'
      ? record.paidGrossAmount
      : typeof record.paid_gross_amount === 'string'
        ? record.paid_gross_amount
        : null;
  const installmentIndex =
    typeof record.installmentIndex === 'number'
      ? record.installmentIndex
      : typeof record.installment_index === 'number'
        ? record.installment_index
        : null;
  const source = typeof record.source === 'string' ? record.source : null;
  if (!paidAt || !grossPaid) return null;
  return { paidAt, grossPaid, installmentIndex, source };
}

/** Fold audit trail into verified installment payments (chronological). */
export function verifiedInstallmentPaymentsFromAudits(
  audits: readonly ExpensePaymentAuditRow[],
  scheduleDueDates: readonly BusinessDate[],
  currency: string,
): readonly VerifiedInstallmentPayment[] {
  const confirmed = audits
    .filter((row) => row.action === 'expense.payment_confirmed')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const out: VerifiedInstallmentPayment[] = [];
  for (const row of confirmed) {
    const slice = readAuditPaymentSlice(row.after);
    if (!slice || !slice.paidAt) continue;
    const index = slice.installmentIndex;
    if (index == null || index < 0 || index >= scheduleDueDates.length) continue;
    const gross = fromNumericString(slice.grossPaid, currency);
    if (!gross || !isPositiveMoney(gross)) continue;
    out.push({
      installmentIndex: index,
      dueDate: scheduleDueDates[index]!,
      actualPaidAt: businessDate(slice.paidAt.slice(0, 10)),
      grossPaid: roundMoney(gross),
      verification: 'verified',
      source: 'audit',
      paymentReference: slice.source,
    });
  }
  return out;
}

/** Optional paidAt on stored cash schedule lines (no migration — JSON payload). */
export function verifiedInstallmentPaymentsFromStoredSchedule(
  stored: unknown,
  currency: string,
  scheduleDueDates: readonly BusinessDate[],
): readonly VerifiedInstallmentPayment[] {
  const parsed = parseStoredCashInstallmentSchedule(stored);
  if (!parsed) return [];
  const out: VerifiedInstallmentPayment[] = [];
  for (let index = 0; index < parsed.lines.length; index += 1) {
    const line = parsed.lines[index]!;
    const raw = line as { paidAt?: string };
    if (typeof raw.paidAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.paidAt)) continue;
    const gross = fromNumericString(line.amount, currency);
    if (!gross || !isPositiveMoney(gross)) continue;
    out.push({
      installmentIndex: index,
      dueDate: scheduleDueDates[index] ?? businessDate(line.dueDate),
      actualPaidAt: businessDate(raw.paidAt),
      grossPaid: roundMoney(gross),
      verification: 'verified',
      source: 'stored_schedule',
    });
  }
  return out;
}

export function mergeVerifiedInstallmentPayments(
  ...groups: readonly (readonly VerifiedInstallmentPayment[])[]
): readonly VerifiedInstallmentPayment[] {
  const byIndex = new Map<number, VerifiedInstallmentPayment>();
  for (const group of groups) {
    for (const payment of group) {
      const existing = byIndex.get(payment.installmentIndex);
      if (!existing || existing.verification !== 'verified') {
        byIndex.set(payment.installmentIndex, payment);
      }
    }
  }
  return [...byIndex.values()].sort((a, b) => a.installmentIndex - b.installmentIndex);
}

export function resolveVerifiedInstallmentPayments(input: {
  readonly grossAmount: string;
  readonly currency: string;
  readonly installmentCount: number;
  readonly installmentStartDate: string;
  readonly expenseDate: string;
  readonly cashInstallmentSchedule: unknown;
  readonly audits: readonly ExpensePaymentAuditRow[];
}): readonly VerifiedInstallmentPayment[] {
  if (input.installmentCount <= 1) return [];
  const grossTotal = fromNumericString(input.grossAmount, input.currency);
  if (!grossTotal || isZeroMoney(grossTotal)) return [];

  const schedule = resolveCashInstallmentLines({
    totalGross: grossTotal,
    installmentCount: input.installmentCount,
    startDate: businessDate(input.installmentStartDate ?? input.expenseDate),
    stored: input.cashInstallmentSchedule,
  });
  const dueDates = schedule.map((line) => line.dueDate);

  return mergeVerifiedInstallmentPayments(
    verifiedInstallmentPaymentsFromAudits(input.audits, dueDates, input.currency),
    verifiedInstallmentPaymentsFromStoredSchedule(
      input.cashInstallmentSchedule,
      input.currency,
      dueDates,
    ),
  );
}

export function verifiedGrossInYearMonth(
  payments: readonly VerifiedInstallmentPayment[],
  yearMonth: string,
): MoneyValue {
  let total = money('0', payments[0]?.grossPaid.currency ?? 'ILS');
  for (const payment of payments) {
    if (payment.verification !== 'verified') continue;
    if (yearMonthFromBusinessDate(payment.actualPaidAt) !== yearMonth) continue;
    total = roundMoney(money(String(Number(total.amount) + Number(payment.grossPaid.amount)), total.currency));
  }
  return total;
}
