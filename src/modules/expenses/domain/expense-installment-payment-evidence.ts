/**
 * Installment payment evidence — never treat due_date as actual payment date.
 */

import { yearMonthFromBusinessDate } from '@/modules/month-close';
import { businessDate, type BusinessDate } from '@/shared/dates';
import {
  addMoney,
  fromNumericString,
  isPositiveMoney,
  isZeroMoney,
  roundMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import {
  parseStoredCashInstallmentSchedule,
  resolveCashInstallmentLines,
  type CashInstallmentLine,
} from './cash-installment-schedule';

export type InstallmentSliceVerification = 'verified' | 'date_unknown';

export type ExpenseInstallmentPaymentStatus =
  | 'UNPAID'
  | 'PAID_VERIFIED'
  | 'PAID_DATE_UNKNOWN'
  | 'PARTIALLY_VERIFIED';

/** Per-slice evidence. installmentIndex -1 = lump audit without index (single cash event). */
export interface InstallmentPaymentSlice {
  readonly installmentIndex: number;
  readonly dueDate: BusinessDate | null;
  readonly actualPaidAt: BusinessDate | null;
  readonly grossPaid: MoneyValue;
  readonly verification: InstallmentSliceVerification;
  readonly source: 'audit' | 'stored_schedule' | 'ledger' | 'inferred_gap';
  readonly paymentReference?: string | null;
}

export interface ExpensePaymentAuditRow {
  readonly action: string;
  readonly createdAt: string;
  readonly after: unknown;
}

export interface InstallmentPaymentResolution {
  readonly status: ExpenseInstallmentPaymentStatus;
  readonly slices: readonly InstallmentPaymentSlice[];
  /** Gross paid on expense row minus gross with verified month (still paid, month not assignable). */
  readonly dateUnknownGross: MoneyValue;
  readonly verifiedGrossTotal: MoneyValue;
  readonly paidGrossTotal: MoneyValue;
  readonly openGross: MoneyValue;
}

/** Drop lump confirmations voided before indexed installment evidence (e.g. דלק). */
function paymentConfirmedAudits(audits: readonly ExpensePaymentAuditRow[]): ExpensePaymentAuditRow[] {
  const sorted = [...audits].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const voidAt = sorted
    .filter((row) => row.action === 'expense.payment_confirmation_voided')
    .map((row) => row.createdAt);
  if (voidAt.length === 0) {
    return sorted.filter((row) => row.action === 'expense.payment_confirmed');
  }
  const lastVoid = voidAt[voidAt.length - 1]!;
  return sorted.filter(
    (row) => row.action === 'expense.payment_confirmed' && row.createdAt > lastVoid,
  );
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
  if (!grossPaid) return null;
  return { paidAt, grossPaid, installmentIndex, source };
}

function slicesFromIndexedAudits(
  audits: readonly ExpensePaymentAuditRow[],
  schedule: readonly CashInstallmentLine[],
  currency: string,
): InstallmentPaymentSlice[] {
  const confirmed = audits
    .filter((row) => row.action === 'expense.payment_confirmed')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const byIndex = new Map<number, InstallmentPaymentSlice>();
  for (const row of confirmed) {
    const slice = readAuditPaymentSlice(row.after);
    if (!slice) continue;
    const gross = fromNumericString(slice.grossPaid, currency);
    if (!gross || !isPositiveMoney(gross)) continue;
    const index = slice.installmentIndex;
    if (index == null) continue;
    if (index < 0 || index >= schedule.length) continue;
    if (!slice.paidAt) continue;
    byIndex.set(index, {
      installmentIndex: index,
      dueDate: schedule[index]!.dueDate,
      actualPaidAt: businessDate(slice.paidAt.slice(0, 10)),
      grossPaid: roundMoney(gross),
      verification: 'verified',
      source: 'audit',
      paymentReference: slice.source,
    });
  }
  return [...byIndex.values()];
}

function slicesFromLumpAudits(
  audits: readonly ExpensePaymentAuditRow[],
  currency: string,
  expenseDate: BusinessDate,
  installmentCount: number,
): InstallmentPaymentSlice[] {
  const confirmed = audits
    .filter((row) => row.action === 'expense.payment_confirmed')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const out: InstallmentPaymentSlice[] = [];
  for (const row of confirmed) {
    const slice = readAuditPaymentSlice(row.after);
    if (!slice || slice.installmentIndex != null) continue;
    const gross = fromNumericString(slice.grossPaid, currency);
    if (!gross || !isPositiveMoney(gross)) continue;
    const manualMultiInstallment =
      installmentCount > 1 && (slice.source === 'manual' || slice.source == null);
    if (manualMultiInstallment) {
      out.push({
        installmentIndex: -1,
        dueDate: expenseDate,
        actualPaidAt: null,
        grossPaid: roundMoney(gross),
        verification: 'date_unknown',
        source: 'audit',
        paymentReference: slice.source,
      });
      continue;
    }
    if (!slice.paidAt) {
      out.push({
        installmentIndex: -1,
        dueDate: expenseDate,
        actualPaidAt: null,
        grossPaid: roundMoney(gross),
        verification: 'date_unknown',
        source: 'audit',
        paymentReference: slice.source,
      });
      continue;
    }
    out.push({
      installmentIndex: -1,
      dueDate: expenseDate,
      actualPaidAt: businessDate(slice.paidAt.slice(0, 10)),
      grossPaid: roundMoney(gross),
      verification: 'verified',
      source: 'audit',
      paymentReference: slice.source,
    });
  }
  return out;
}

function slicesFromStoredSchedule(
  stored: unknown,
  schedule: readonly CashInstallmentLine[],
  currency: string,
): InstallmentPaymentSlice[] {
  const parsed = parseStoredCashInstallmentSchedule(stored);
  if (!parsed) return [];
  const out: InstallmentPaymentSlice[] = [];
  for (let index = 0; index < parsed.lines.length; index += 1) {
    const line = parsed.lines[index]!;
    const raw = line as { paidAt?: string };
    if (typeof raw.paidAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.paidAt)) continue;
    const gross = fromNumericString(line.amount, currency);
    if (!gross || !isPositiveMoney(gross)) continue;
    out.push({
      installmentIndex: index,
      dueDate: schedule[index]?.dueDate ?? businessDate(line.dueDate),
      actualPaidAt: businessDate(raw.paidAt),
      grossPaid: roundMoney(gross),
      verification: 'verified',
      source: 'stored_schedule',
    });
  }
  return out;
}

/** @deprecated Use InstallmentPaymentSlice */
export type VerifiedInstallmentPayment = InstallmentPaymentSlice & {
  readonly actualPaidAt: BusinessDate;
  readonly verification: 'verified';
};

export function resolveInstallmentPaymentState(input: {
  readonly grossAmount: string;
  readonly currency: string;
  readonly installmentCount: number;
  readonly installmentStartDate: string;
  readonly expenseDate: string;
  readonly cashInstallmentSchedule: unknown;
  readonly installmentsPaidCount: number;
  readonly paidGrossAmount: string | null;
  readonly paidAt: string | null;
  readonly audits: readonly ExpensePaymentAuditRow[];
  readonly ledgerSlices?: readonly InstallmentPaymentSlice[];
}): InstallmentPaymentResolution {
  const currency = input.currency;
  const grossTotal = fromNumericString(input.grossAmount, currency) ?? zeroMoney(currency);
  const paidGross =
    fromNumericString(input.paidGrossAmount ?? '0', currency) ?? zeroMoney(currency);

  if (input.installmentCount <= 1 || isZeroMoney(grossTotal)) {
    const open = subtractMoney(grossTotal, paidGross);
    return {
      status: isPositiveMoney(paidGross)
        ? input.paidAt
          ? 'PAID_VERIFIED'
          : 'PAID_DATE_UNKNOWN'
        : 'UNPAID',
      slices: [],
      dateUnknownGross: input.paidAt || !isPositiveMoney(paidGross) ? zeroMoney(currency) : paidGross,
      verifiedGrossTotal: input.paidAt && isPositiveMoney(paidGross) ? roundMoney(paidGross) : zeroMoney(currency),
      paidGrossTotal: roundMoney(paidGross),
      openGross: isPositiveMoney(open) ? roundMoney(open) : zeroMoney(currency),
    };
  }

  const schedule = resolveCashInstallmentLines({
    totalGross: grossTotal,
    installmentCount: input.installmentCount,
    startDate: businessDate(input.installmentStartDate ?? input.expenseDate),
    stored: input.cashInstallmentSchedule,
  });
  const expenseDate = businessDate(input.expenseDate);
  if (!isPositiveMoney(paidGross) && input.installmentsPaidCount <= 0) {
    return {
      status: 'UNPAID',
      slices: [],
      dateUnknownGross: zeroMoney(currency),
      verifiedGrossTotal: zeroMoney(currency),
      paidGrossTotal: zeroMoney(currency),
      openGross: roundMoney(grossTotal),
    };
  }
  const confirmedAudits = paymentConfirmedAudits(input.audits);
  const ledgerSlices = input.ledgerSlices ?? [];
  const ledgerIndices = new Set(
    ledgerSlices.filter((s) => s.installmentIndex >= 0).map((s) => s.installmentIndex),
  );
  const skipLumpAudits = ledgerSlices.some((s) => s.source === 'ledger' && s.installmentIndex >= 0);

  const slices: InstallmentPaymentSlice[] = [
    ...ledgerSlices,
    ...slicesFromIndexedAudits(confirmedAudits, schedule, currency).filter(
      (s) => !ledgerIndices.has(s.installmentIndex),
    ),
    ...(skipLumpAudits
      ? []
      : slicesFromLumpAudits(confirmedAudits, currency, expenseDate, input.installmentCount)),
    ...slicesFromStoredSchedule(input.cashInstallmentSchedule, schedule, currency).filter(
      (s) => !ledgerIndices.has(s.installmentIndex),
    ),
  ];

  let verifiedGross = zeroMoney(currency);
  let dateUnknownGross = zeroMoney(currency);
  for (const slice of slices) {
    if (slice.verification === 'date_unknown') {
      dateUnknownGross = addMoney(dateUnknownGross, slice.grossPaid);
      continue;
    }
    if (slice.verification === 'verified' && slice.actualPaidAt) {
      verifiedGross = addMoney(verifiedGross, slice.grossPaid);
    }
  }
  dateUnknownGross = roundMoney(dateUnknownGross);

  const hasAnyLumpSlice = slices.some((s) => s.installmentIndex === -1);
  if (!hasAnyLumpSlice && input.installmentsPaidCount > 0 && isPositiveMoney(paidGross)) {
    const indexed = new Set(
      slices.filter((s) => s.installmentIndex >= 0).map((s) => s.installmentIndex),
    );
    const completed = Math.min(input.installmentsPaidCount, schedule.length);
    for (let index = 0; index < completed; index += 1) {
      if (indexed.has(index)) continue;
      const line = schedule[index];
      if (!line) continue;
      dateUnknownGross = addMoney(dateUnknownGross, line.amount);
    }
    dateUnknownGross = roundMoney(dateUnknownGross);
  }

  const openGross = subtractMoney(grossTotal, paidGross);
  let status: ExpenseInstallmentPaymentStatus = 'UNPAID';
  if (isPositiveMoney(paidGross)) {
    if (isPositiveMoney(dateUnknownGross) && isPositiveMoney(verifiedGross)) {
      status = 'PARTIALLY_VERIFIED';
    } else if (isPositiveMoney(dateUnknownGross)) {
      status = 'PAID_DATE_UNKNOWN';
    } else if (isPositiveMoney(verifiedGross)) {
      status = 'PAID_VERIFIED';
    } else {
      status = 'PAID_DATE_UNKNOWN';
    }
  }

  return {
    status,
    slices,
    dateUnknownGross,
    verifiedGrossTotal: roundMoney(verifiedGross),
    paidGrossTotal: roundMoney(paidGross),
    openGross: isPositiveMoney(openGross) ? roundMoney(openGross) : zeroMoney(currency),
  };
}

/** Back-compat wrapper for callers expecting indexed verified list only. */
export function resolveVerifiedInstallmentPayments(input: {
  readonly grossAmount: string;
  readonly currency: string;
  readonly installmentCount: number;
  readonly installmentStartDate: string;
  readonly expenseDate: string;
  readonly cashInstallmentSchedule: unknown;
  readonly installmentsPaidCount: number;
  readonly paidGrossAmount: string | null;
  readonly paidAt: string | null;
  readonly audits: readonly ExpensePaymentAuditRow[];
  readonly ledgerSlices?: readonly InstallmentPaymentSlice[];
}): readonly InstallmentPaymentSlice[] {
  return resolveInstallmentPaymentState(input).slices.filter(
    (s) => s.verification === 'verified' && s.actualPaidAt != null,
  );
}

export function verifiedGrossInYearMonth(
  slices: readonly InstallmentPaymentSlice[],
  yearMonth: string,
): MoneyValue {
  const currency = slices[0]?.grossPaid.currency ?? 'ILS';
  let total = zeroMoney(currency);
  for (const slice of slices) {
    if (slice.verification !== 'verified' || !slice.actualPaidAt) continue;
    if (yearMonthFromBusinessDate(slice.actualPaidAt) !== yearMonth) continue;
    total = addMoney(total, slice.grossPaid);
  }
  return roundMoney(total);
}
