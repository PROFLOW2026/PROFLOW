/**
 * Vendor credit notes (AP) — domain rules.
 *
 * HARD RULES:
 * - Credits ≠ payments. Credits reduce economic cost (Actual) and payable outstanding.
 * - Payments are cash only and never reduce Actual.
 * - Outstanding = bill total − active payments − active credit applications.
 * - Recognized Actual for a posted bill = bill total − active credit applications
 *   (void bills contribute zero Actual entirely).
 * - No silent rewrite of credit amount / applications; void + new credit is the correction path.
 */

import { DomainRuleError } from '@/shared/errors';
import {
  addMoney,
  compareMoney,
  divideMoney,
  isPositiveMoney,
  money,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { isRecognizedVendorBillStatus } from './vendor-cost-recognition';

export const AP_CREDIT_STATUSES = ['draft', 'open', 'applied', 'void'] as const;
export type ApCreditStatus = (typeof AP_CREDIT_STATUSES)[number];

export const AP_CREDIT_APPLICATION_STATUSES = ['applied', 'void'] as const;
export type ApCreditApplicationStatus = (typeof AP_CREDIT_APPLICATION_STATUSES)[number];

/** Persistence is live with 0022 schema; tests may override. */
export const AP_CREDITS_PERSISTENCE_READY = true as boolean;

let creditsReadyOverride: boolean | undefined;

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

export function setApCreditsPersistenceReadyForTests(ready: boolean | undefined): void {
  if (!isTestRuntime()) {
    throw new Error('setApCreditsPersistenceReadyForTests is test-only');
  }
  creditsReadyOverride = ready;
}

export function areApCreditsAvailable(): boolean {
  if (creditsReadyOverride !== undefined) return creditsReadyOverride;
  if (
    isTestRuntime() &&
    (process.env.AP_CREDITS_PERSISTENCE_READY === 'true' ||
      process.env.AP_CREDITS_PERSISTENCE_READY === '1')
  ) {
    return true;
  }
  return AP_CREDITS_PERSISTENCE_READY;
}

/** Documented guard: credits are not cash payments. */
export function assertCreditIsNotPayment(): void {
  // Structural invariant — credits never call payment recognition paths.
}

export function sumActiveCreditAmounts(
  applications: readonly { readonly amount: MoneyValue; readonly status: ApCreditApplicationStatus }[],
  currency: string,
): MoneyValue {
  const code = currency.toUpperCase();
  return sumMoney(
    applications.filter((a) => a.status === 'applied').map((a) => a.amount),
    code,
  );
}

/**
 * Net Actual recognized for one posted bill after credits.
 * Callers must already exclude void/draft bills.
 */
export function netRecognizedBillAfterCredits(input: {
  readonly currency: string;
  readonly billTotal: string;
  readonly appliedCreditAmounts: readonly string[];
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  const credits = sumMoney(
    input.appliedCreditAmounts.map((a) => money(a, currency)),
    currency,
  );
  const net = subtractMoney(money(input.billTotal, currency), credits);
  if (compareMoney(net, zeroMoney(currency)) < 0) {
    return zeroMoney(currency);
  }
  return net;
}

/**
 * Scale a project slice of bill Actual after credits so org-wide Actual drops
 * by the credit amount without inventing a second recognition path.
 * Uses proportional reduction: slice * net / billTotal.
 */
export function scaleBillSliceAfterCredits(input: {
  readonly currency: string;
  readonly billTotal: string;
  readonly sliceAmount: string;
  readonly appliedCreditAmounts: readonly string[];
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  const billTotal = money(input.billTotal, currency);
  const slice = money(input.sliceAmount, currency);
  if (!isPositiveMoney(billTotal)) return zeroMoney(currency);

  const net = netRecognizedBillAfterCredits({
    currency,
    billTotal: input.billTotal,
    appliedCreditAmounts: input.appliedCreditAmounts,
  });
  if (!isPositiveMoney(net)) return zeroMoney(currency);
  if (compareMoney(net, billTotal) === 0) return slice;

  // slice * net / billTotal via money helpers (not JS floats for the arithmetic path).
  return divideMoney(multiplyMoney(slice, net.amount), billTotal.amount);
}

export function assertCreditCreatable(input: {
  readonly amount: string;
  readonly currency: string;
}): void {
  const amount = money(input.amount, input.currency);
  if (!isPositiveMoney(amount)) {
    throw new DomainRuleError(
      'Credit amount must be positive',
      'ap.errors.creditAmountInvalid',
    );
  }
  assertCreditIsNotPayment();
}

export function assertCreditApplicable(input: {
  readonly creditStatus: ApCreditStatus;
  readonly creditCurrency: string;
  readonly billStatus: string;
  readonly billCurrency: string;
  readonly creditVendorId: string;
  readonly billVendorId: string;
  readonly applyAmount: string;
  readonly creditRemaining: string;
  readonly billOutstandingBeforeCredit: string;
}): void {
  assertCreditIsNotPayment();

  if (input.creditStatus === 'void' || input.creditStatus === 'draft') {
    throw new DomainRuleError(
      'Only open credits can be applied',
      'ap.errors.creditNotApplicable',
    );
  }
  if (input.creditStatus === 'applied') {
    // Fully applied credits have no remaining — remaining check below covers it.
  }
  if (!isRecognizedVendorBillStatus(input.billStatus)) {
    throw new DomainRuleError(
      'Cannot apply credit to a draft or void bill',
      'ap.errors.creditBillNotPayable',
    );
  }
  if (input.creditCurrency.toUpperCase() !== input.billCurrency.toUpperCase()) {
    throw new DomainRuleError(
      'Credit currency must match the bill currency',
      'ap.errors.currencyMismatch',
    );
  }
  if (input.creditVendorId !== input.billVendorId) {
    throw new DomainRuleError(
      'Credit vendor must match the bill vendor',
      'ap.errors.vendorMismatch',
    );
  }

  const currency = input.creditCurrency.toUpperCase();
  const apply = money(input.applyAmount, currency);
  if (!isPositiveMoney(apply)) {
    throw new DomainRuleError(
      'Credit application amount must be positive',
      'ap.errors.creditAmountInvalid',
    );
  }
  const remaining = money(input.creditRemaining, currency);
  if (compareMoney(apply, remaining) > 0) {
    throw new DomainRuleError(
      'Application exceeds credit remaining',
      'ap.errors.creditOverApplied',
    );
  }
  const outstanding = money(input.billOutstandingBeforeCredit, currency);
  if (compareMoney(apply, outstanding) > 0) {
    throw new DomainRuleError(
      'Application exceeds bill outstanding',
      'ap.errors.creditOverApplied',
    );
  }
}

export function deriveCreditStatusAfterApplication(input: {
  readonly creditAmount: string;
  readonly priorAppliedAmounts: readonly string[];
  readonly newApplicationAmount: string;
  readonly currency: string;
}): ApCreditStatus {
  const currency = input.currency.toUpperCase();
  const applied = addMoney(
    sumMoney(
      input.priorAppliedAmounts.map((a) => money(a, currency)),
      currency,
    ),
    money(input.newApplicationAmount, currency),
  );
  const total = money(input.creditAmount, currency);
  if (compareMoney(applied, total) >= 0) return 'applied';
  return 'open';
}

export function creditRemaining(input: {
  readonly creditAmount: string;
  readonly appliedAmounts: readonly string[];
  readonly currency: string;
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  const remaining = subtractMoney(
    money(input.creditAmount, currency),
    sumMoney(
      input.appliedAmounts.map((a) => money(a, currency)),
      currency,
    ),
  );
  if (compareMoney(remaining, zeroMoney(currency)) < 0) {
    return zeroMoney(currency);
  }
  return remaining;
}

/** UI lifecycle labels — pending approval is draft + submitted request, not a DB status. */
export const AP_CREDIT_LIFECYCLE_DISPLAY_STATUSES = [
  'draft',
  'pending_approval',
  'open',
  'applied',
  'void',
] as const;
export type ApCreditLifecycleDisplayStatus =
  (typeof AP_CREDIT_LIFECYCLE_DISPLAY_STATUSES)[number];

export function displayCreditLifecycleStatus(input: {
  readonly creditStatus: ApCreditStatus;
  readonly approvalRequestStatus?: string | null;
}): ApCreditLifecycleDisplayStatus {
  if (input.creditStatus === 'void') return 'void';
  if (input.creditStatus === 'applied') return 'applied';
  if (input.creditStatus === 'open') return 'open';
  if (input.approvalRequestStatus === 'submitted') return 'pending_approval';
  return 'draft';
}

/** Amount / date / notes / reference may change only while the credit is draft. */
export function assertCreditDraftEditable(creditStatus: ApCreditStatus): void {
  if (creditStatus !== 'draft') {
    throw new DomainRuleError(
      'Only draft vendor credits can be edited; post, apply, or void instead of silent rewrite',
      'ap.errors.creditNotDraftEditable',
    );
  }
}

/**
 * Void is the correction path. No hard delete.
 * Active applications are unwound (voided) by the application layer, then the credit is voided.
 */
export function assertCreditVoidable(input: {
  readonly creditStatus: ApCreditStatus;
}): void {
  if (input.creditStatus === 'void') {
    throw new DomainRuleError('Vendor credit is already void', 'ap.errors.creditAlreadyVoid');
  }
}

/** Posted / applied credits must not be silently rewritten. */
export function assertCreditNotSilentlyEditable(creditStatus: ApCreditStatus): void {
  if (creditStatus !== 'draft') {
    throw new DomainRuleError(
      'Posted vendor credits cannot be silently edited; void and replace, or apply remaining',
      'ap.errors.creditNotSilentlyEditable',
    );
  }
}
