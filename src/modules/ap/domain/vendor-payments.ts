/**
 * Vendor payments (AP cash) — domain rules.
 *
 * HARD RULES:
 * - Vendor Bill recognition → Actual Cost (see vendor-cost-recognition.ts).
 * - Vendor Payment → cash / AP outstanding only. NEVER increases Actual Cost.
 * - Outstanding is always derived: bill total − active applications (never a mutable balance).
 * - Partial + multiple payments per bill are allowed.
 * - Void is explicit (status flip + voidedAt). No silent amount rewrite.
 * - Prefer payment header + applications to bills (cleaner than 1:1 AR-style rows).
 *
 * FINANCIAL IMMUTABILITY (app layer — Agent A may add matching DB triggers):
 * - Recorded payments cannot be deleted.
 * - Financial fields are frozen after insert: amount, currency, paymentDate, vendorId.
 * - Applications cannot be silently edited or deleted.
 * - Correction path = void the recorded payment + create a new payment.
 * - Voided payments remain as rows but contribute zero to paid / outstanding.
 * - Optional non-financial metadata (method / reference / notes) may be updated
 *   while status is `recorded`; voided rows stay fully frozen.
 */

import { DomainRuleError } from '@/shared/errors';
import {
  addMoney,
  compareMoney,
  isPositiveMoney,
  isZeroMoney,
  money,
  subtractMoney,
  sumMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { isRecognizedVendorBillStatus, isVendorPaymentRecognizedActual } from './vendor-cost-recognition';

export const AP_PAYMENT_STATUSES = ['recorded', 'void'] as const;
export type ApPaymentStatus = (typeof AP_PAYMENT_STATUSES)[number];

/** Payable collection state derived from applications — independent of PO match status. */
export const AP_PAYABLE_STATUSES = ['unpaid', 'partial', 'paid'] as const;
export type ApPayableStatus = (typeof AP_PAYABLE_STATUSES)[number];

export interface VendorPaymentAmountInput {
  readonly amount: MoneyValue;
  readonly status: ApPaymentStatus;
}

export interface VendorPaymentApplicationInput {
  readonly appliedAmount: MoneyValue;
  /** Parent payment status — void payments contribute zero. */
  readonly paymentStatus: ApPaymentStatus;
}

export interface BillPayableInput {
  readonly billStatus: string;
  readonly billTotal: MoneyValue;
  readonly applications: readonly VendorPaymentApplicationInput[];
}

/**
 * Persistence gate for `ap_payments` / `ap_payment_applications`.
 * Owner applied `0020_overnight_foundations` — production uses Drizzle.
 * Disposable tests may override via `setApPaymentsPersistenceReadyForTests`.
 */
export const AP_PAYMENTS_PERSISTENCE_READY = true as boolean;

let persistenceReadyOverride: boolean | undefined;

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

/**
 * Test-only override so integration suites can exercise the Drizzle repository
 * on disposable PGlite without flipping the production constant.
 * Pass `undefined` to clear the override.
 */
export function setApPaymentsPersistenceReadyForTests(ready: boolean | undefined): void {
  if (!isTestRuntime()) {
    throw new Error('setApPaymentsPersistenceReadyForTests is test-only');
  }
  persistenceReadyOverride = ready;
}

export function areApPaymentsAvailable(): boolean {
  if (persistenceReadyOverride !== undefined) return persistenceReadyOverride;
  if (
    isTestRuntime() &&
    (process.env.AP_PAYMENTS_PERSISTENCE_READY === 'true' ||
      process.env.AP_PAYMENTS_PERSISTENCE_READY === '1')
  ) {
    return true;
  }
  return AP_PAYMENTS_PERSISTENCE_READY;
}

/** Guard documented for financial compose: payments never enter Actual. */
export function assertVendorPaymentDoesNotAffectActual(): void {
  if (isVendorPaymentRecognizedActual()) {
    throw new DomainRuleError(
      'Vendor payment must never recognize Actual Cost',
      'ap.errors.paymentAffectsActual',
    );
  }
}

export function sumActivePaymentAmounts(
  payments: readonly VendorPaymentAmountInput[],
  currency: string,
): MoneyValue {
  const code = currency.toUpperCase();
  return sumMoney(
    payments.filter((p) => p.status === 'recorded').map((p) => p.amount),
    code,
  );
}

export function sumActiveAppliedAmounts(
  applications: readonly VendorPaymentApplicationInput[],
  currency: string,
): MoneyValue {
  const code = currency.toUpperCase();
  return sumMoney(
    applications
      .filter((a) => a.paymentStatus === 'recorded')
      .map((a) => a.appliedAmount),
    code,
  );
}

/** Draft/void bills have no payable outstanding (and draft never recognized Actual). */
export function isBillPayable(billStatus: string): boolean {
  return isRecognizedVendorBillStatus(billStatus);
}

/**
 * Remaining bill outstanding after prior *active* applications.
 * Used inside allocation validation (post lock).
 */
export function computeBillRemainingOutstanding(input: {
  readonly currency: string;
  readonly billTotal: string;
  readonly billStatus: string;
  readonly priorAppliedAmounts: readonly string[];
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  if (!isBillPayable(input.billStatus)) {
    return zeroMoney(currency);
  }
  const prior = sumMoney(
    input.priorAppliedAmounts.map((a) => money(a, currency)),
    currency,
  );
  const outstanding = subtractMoney(money(input.billTotal, currency), prior);
  if (compareMoney(outstanding, zeroMoney(currency)) < 0) {
    return zeroMoney(currency);
  }
  return outstanding;
}

/**
 * Payment header remaining after proposed applications.
 * Over-application of the payment itself is rejected when remaining goes negative
 * or when final remaining is not zero (header must equal applications).
 */
export function computePaymentRemaining(input: {
  readonly currency: string;
  readonly paymentAmount: string;
  readonly applicationAmounts: readonly string[];
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  const applied = sumMoney(
    input.applicationAmounts.map((a) => money(a, currency)),
    currency,
  );
  return subtractMoney(money(input.paymentAmount, currency), applied);
}

export function computeBillOutstanding(input: BillPayableInput): MoneyValue {
  const currency = input.billTotal.currency;
  if (!isBillPayable(input.billStatus)) {
    return zeroMoney(currency);
  }
  const paid = sumActiveAppliedAmounts(input.applications, currency);
  const outstanding = subtractMoney(input.billTotal, paid);
  if (compareMoney(outstanding, zeroMoney(currency)) < 0) {
    return zeroMoney(currency);
  }
  return outstanding;
}

export function derivePayableStatus(input: BillPayableInput): ApPayableStatus | null {
  if (!isBillPayable(input.billStatus)) return null;
  const paid = sumActiveAppliedAmounts(input.applications, input.billTotal.currency);
  const outstanding = computeBillOutstanding(input);
  if (isZeroMoney(outstanding) || !isPositiveMoney(outstanding)) return 'paid';
  if (isZeroMoney(paid)) return 'unpaid';
  return 'partial';
}

/** No FX — payment currency must equal each bill currency (ILS ≠ USD). */
export function assertApPaymentCurrencyMatch(
  paymentCurrency: string,
  billCurrency: string,
): void {
  if (paymentCurrency.toUpperCase() !== billCurrency.toUpperCase()) {
    throw new DomainRuleError(
      'Bill currency must match payment currency',
      'ap.errors.currencyMismatch',
    );
  }
}

/**
 * Validates a payment header amount equals the sum of its applications,
 * and that each application does not exceed the bill's remaining outstanding
 * (computed from prior applications only).
 */
export function assertPaymentApplicationsValid(input: {
  readonly currency: string;
  readonly paymentAmount: string;
  readonly applications: readonly {
    readonly apBillId: string;
    readonly appliedAmount: string;
    readonly billStatus: string;
    readonly billTotal: string;
    readonly priorAppliedAmounts: readonly string[];
  }[];
}): void {
  assertVendorPaymentDoesNotAffectActual();

  const currency = input.currency.toUpperCase();
  const paymentAmount = money(input.paymentAmount, currency);
  if (!isPositiveMoney(paymentAmount)) {
    throw new DomainRuleError(
      'Payment amount must be positive',
      'ap.errors.paymentAmountInvalid',
    );
  }

  if (input.applications.length === 0) {
    throw new DomainRuleError(
      'Payment requires at least one bill application',
      'ap.errors.paymentApplicationRequired',
    );
  }

  let appliedSum = zeroMoney(currency);
  const seen = new Set<string>();

  for (const app of input.applications) {
    if (seen.has(app.apBillId)) {
      throw new DomainRuleError(
        'Duplicate bill application in a single payment',
        'ap.errors.paymentDuplicateBill',
      );
    }
    seen.add(app.apBillId);

    if (!isBillPayable(app.billStatus)) {
      throw new DomainRuleError(
        'Cannot apply payment to a draft or void bill',
        'ap.errors.paymentBillNotPayable',
      );
    }

    const applied = money(app.appliedAmount, currency);
    if (!isPositiveMoney(applied)) {
      throw new DomainRuleError(
        'Application amount must be positive',
        'ap.errors.paymentAmountInvalid',
      );
    }

    const outstanding = computeBillRemainingOutstanding({
      currency,
      billTotal: app.billTotal,
      billStatus: app.billStatus,
      priorAppliedAmounts: app.priorAppliedAmounts,
    });
    if (compareMoney(applied, outstanding) > 0) {
      throw new DomainRuleError(
        'Application exceeds bill outstanding',
        'ap.errors.paymentOverApplied',
      );
    }

    appliedSum = addMoney(appliedSum, applied);
  }

  const paymentRemaining = computePaymentRemaining({
    currency,
    paymentAmount: input.paymentAmount,
    applicationAmounts: input.applications.map((a) => a.appliedAmount),
  });
  if (compareMoney(paymentRemaining, zeroMoney(currency)) < 0) {
    throw new DomainRuleError(
      'Applications exceed payment amount',
      'ap.errors.paymentOverApplied',
    );
  }
  if (compareMoney(appliedSum, paymentAmount) !== 0) {
    throw new DomainRuleError(
      'Payment amount must equal the sum of applications',
      'ap.errors.paymentApplicationMismatch',
    );
  }
}

export function assertPaymentVoidable(status: ApPaymentStatus): void {
  if (status !== 'recorded') {
    throw new DomainRuleError(
      'Only recorded payments can be voided',
      'ap.errors.paymentNotVoidable',
    );
  }
}

/** Payments are never hard-deleted — void + recreate is the correction path. */
export function assertPaymentNotDeletable(): never {
  throw new DomainRuleError(
    'Vendor payments cannot be deleted; void the payment and record a correction',
    'ap.errors.paymentNotDeletable',
  );
}

/** Applications are never edited or deleted — void the parent payment instead. */
export function assertPaymentApplicationNotMutable(): never {
  throw new DomainRuleError(
    'Payment applications cannot be edited or deleted; void the payment instead',
    'ap.errors.paymentApplicationImmutable',
  );
}

/**
 * Rejects silent rewrites of financial payment fields.
 * Optional metadata (method / reference / notes) is intentionally excluded.
 */
export function assertPaymentFinancialFieldsImmutable(attempt: {
  readonly amount?: boolean;
  readonly currency?: boolean;
  readonly paymentDate?: boolean;
  readonly vendorId?: boolean;
  readonly statusRewriteWithoutVoid?: boolean;
}): void {
  if (
    attempt.amount ||
    attempt.currency ||
    attempt.paymentDate ||
    attempt.vendorId ||
    attempt.statusRewriteWithoutVoid
  ) {
    throw new DomainRuleError(
      'Payment financial fields are immutable; void and create a new payment to correct',
      'ap.errors.paymentImmutable',
    );
  }
}

/**
 * Metadata allowed to change on a recorded payment only.
 * Voided payments are fully frozen (including metadata).
 */
export function assertPaymentMetadataEditable(status: ApPaymentStatus): void {
  if (status !== 'recorded') {
    throw new DomainRuleError(
      'Only recorded payments allow metadata updates',
      'ap.errors.paymentMetadataFrozen',
    );
  }
}

/**
 * Scenario helper: apply sequential payments and return outstanding + Actual unchanged.
 * Pure — used by unit tests (Bill 92k → pay 50/30/12).
 */
export function applySequentialBillPayments(input: {
  readonly currency: string;
  readonly billTotal: string;
  readonly billStatus: string;
  readonly paymentAmounts: readonly string[];
  readonly recognizedActual: string;
}): {
  readonly outstandingAfterEach: readonly string[];
  readonly finalOutstanding: string;
  readonly finalPayableStatus: ApPayableStatus | null;
  readonly recognizedActualUnchanged: string;
  readonly actualEqualsBill: boolean;
} {
  assertVendorPaymentDoesNotAffectActual();

  const currency = input.currency.toUpperCase();
  const applications: VendorPaymentApplicationInput[] = [];
  const outstandingAfterEach: string[] = [];

  for (const amount of input.paymentAmounts) {
    applications.push({
      appliedAmount: money(amount, currency),
      paymentStatus: 'recorded',
    });
    const outstanding = computeBillOutstanding({
      billStatus: input.billStatus,
      billTotal: money(input.billTotal, currency),
      applications,
    });
    outstandingAfterEach.push(outstanding.amount);
  }

  const final = computeBillOutstanding({
    billStatus: input.billStatus,
    billTotal: money(input.billTotal, currency),
    applications,
  });
  const payableStatus = derivePayableStatus({
    billStatus: input.billStatus,
    billTotal: money(input.billTotal, currency),
    applications,
  });

  const recognized = money(input.recognizedActual, currency);
  const bill = money(input.billTotal, currency);

  return {
    outstandingAfterEach,
    finalOutstanding: final.amount,
    finalPayableStatus: payableStatus,
    recognizedActualUnchanged: recognized.amount,
    actualEqualsBill: compareMoney(recognized, bill) === 0,
  };
}

export function aggregateVendorOutstanding(input: {
  readonly currency: string;
  readonly bills: readonly BillPayableInput[];
}): {
  readonly billed: MoneyValue;
  readonly paid: MoneyValue;
  readonly outstanding: MoneyValue;
  readonly unpaidCount: number;
  readonly partialCount: number;
  readonly paidCount: number;
} {
  const currency = input.currency.toUpperCase();
  let billed = zeroMoney(currency);
  let paid = zeroMoney(currency);
  let unpaidCount = 0;
  let partialCount = 0;
  let paidCount = 0;

  for (const bill of input.bills) {
    if (!isBillPayable(bill.billStatus)) continue;
    if (bill.billTotal.currency !== currency) continue;

    billed = addMoney(billed, bill.billTotal);
    const applied = sumActiveAppliedAmounts(bill.applications, currency);
    paid = addMoney(paid, applied);

    const status = derivePayableStatus(bill);
    if (status === 'unpaid') unpaidCount += 1;
    else if (status === 'partial') partialCount += 1;
    else if (status === 'paid') paidCount += 1;
  }

  return {
    billed,
    paid,
    outstanding: subtractMoney(billed, paid),
    unpaidCount,
    partialCount,
    paidCount,
  };
}
