import { addDays, type BusinessDate } from '@/shared/dates';
import { isPositiveMoney, isZeroMoney, money, type MoneyValue } from '@/shared/money';

export type CertifiedReceiptCertainty = 'confirmed' | 'expected' | 'uncertain';

/** Facts needed to project certified NET into contractor cash-flow (not payment truth). */
export interface CertifiedReceiptCashFacts {
  readonly payableBasisId: string;
  readonly claimId: string;
  readonly claimNumber: number;
  readonly projectId: string;
  readonly agreementId: string;
  readonly agreementTitle: string | null;
  readonly sourceVersion: number;
  readonly payableNet: MoneyValue;
  readonly retentionAmount: MoneyValue;
  readonly certificationDate: BusinessDate | null;
  readonly paymentTermsDays: number | null;
  readonly apBillDueDate: BusinessDate | null;
  readonly scheduleDueDate: BusinessDate | null;
}

export interface CertifiedReceiptCashLine {
  readonly lineKey: 'payable' | 'retention';
  readonly amount: MoneyValue;
  readonly dueDate: BusinessDate | null;
  readonly certainty: CertifiedReceiptCertainty;
}

export function claimCashProjectionIdempotencyKey(input: {
  readonly mappingId: string;
  readonly payableBasisId: string;
}): string {
  return `claim-cash:${input.mappingId}:${input.payableBasisId}`;
}

/**
 * Expected receipt timing — never invent a date without terms, bill due, or schedule.
 * AP bill due date is treated as recorded (developer posted payable).
 */
export function resolveExpectedReceiptTiming(input: {
  readonly apBillDueDate: BusinessDate | null;
  readonly scheduleDueDate: BusinessDate | null;
  readonly certificationDate: BusinessDate | null;
  readonly paymentTermsDays: number | null;
}): { readonly dueDate: BusinessDate | null; readonly recorded: boolean } {
  if (input.apBillDueDate) {
    return { dueDate: input.apBillDueDate, recorded: true };
  }
  if (input.scheduleDueDate) {
    return { dueDate: input.scheduleDueDate, recorded: false };
  }
  if (input.certificationDate != null && input.paymentTermsDays != null && input.paymentTermsDays >= 0) {
    return { dueDate: addDays(input.certificationDate, input.paymentTermsDays), recorded: false };
  }
  return { dueDate: null, recorded: false };
}

function certaintyForTiming(recorded: boolean, dueDate: BusinessDate | null): CertifiedReceiptCertainty {
  if (!dueDate) return 'uncertain';
  return recorded ? 'confirmed' : 'expected';
}

/**
 * Certified payable NET (cash in) plus optional retention holdback line (undated until release rules exist).
 * Skips zero/negative payable; retention line only when held on this basis.
 */
export function buildCertifiedReceiptCashLines(facts: CertifiedReceiptCashFacts): readonly CertifiedReceiptCashLine[] {
  const timing = resolveExpectedReceiptTiming({
    apBillDueDate: facts.apBillDueDate,
    scheduleDueDate: facts.scheduleDueDate,
    certificationDate: facts.certificationDate,
    paymentTermsDays: facts.paymentTermsDays,
  });
  const lines: CertifiedReceiptCashLine[] = [];

  if (isPositiveMoney(facts.payableNet)) {
    lines.push({
      lineKey: 'payable',
      amount: facts.payableNet,
      dueDate: timing.dueDate,
      certainty: certaintyForTiming(timing.recorded, timing.dueDate),
    });
  }

  if (isPositiveMoney(facts.retentionAmount)) {
    lines.push({
      lineKey: 'retention',
      amount: facts.retentionAmount,
      dueDate: null,
      certainty: 'uncertain',
    });
  }

  return lines;
}

export function isoDateFromTimestamp(value: Date | string | null | undefined): BusinessDate | null {
  if (value == null) return null;
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const day = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? (day as BusinessDate) : null;
}

export interface CertifiedReceiptForecastEntry {
  readonly facts: CertifiedReceiptCashFacts;
  readonly lines: readonly CertifiedReceiptCashLine[];
}

export function payableNetMoney(amount: string, currency: string): MoneyValue | null {
  try {
    const value = money(amount, currency);
    if (isZeroMoney(value)) return null;
    return value;
  } catch {
    return null;
  }
}
