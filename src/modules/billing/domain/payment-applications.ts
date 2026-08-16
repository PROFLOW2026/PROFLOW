/**
 * Customer payment applications (AR cash).
 *
 * Outstanding is derived: finalized billing − Σ(applications of non-void payments)
 * − held retention. Applications are immutable history; void the payment to reverse.
 *
 * Unlike AP vendor payments, the payment header may exceed the sum of applications
 * (unapplied remainder / cash on account is allowed). Over-application of an
 * invoice or of the payment itself is rejected.
 */

import { DomainRuleError } from '@/shared/errors';
import {
  addMoney,
  compareMoney,
  isPositiveMoney,
  money,
  subtractMoney,
  sumMoney,
  zeroMoney,
} from '@/shared/money';
import { assertPaymentTarget } from './lifecycle';
import { recordOutstanding } from './outstanding';
import type { BillingKind, BillingRecordStatus } from './types';

export interface CustomerPaymentApplicationDraft {
  readonly billingRecordId: string;
  readonly amount: string;
  readonly kind: BillingKind;
  readonly status: BillingRecordStatus;
  readonly totalAmount: string;
  readonly priorAppliedAmounts: readonly string[];
  readonly priorRetentionHeldRemaining?: string;
  readonly invoiceClientId: string | null;
  readonly invoiceCurrency: string;
}

/**
 * Remaining receivable-now after prior *active* applications (and held retention).
 */
export function computeInvoiceRemainingOutstanding(input: {
  readonly currency: string;
  readonly totalAmount: string;
  readonly kind: BillingKind;
  readonly status: BillingRecordStatus;
  readonly priorAppliedAmounts: readonly string[];
  readonly priorRetentionHeldRemaining?: string;
}) {
  const currency = input.currency.toUpperCase();
  const paid = sumMoney(
    input.priorAppliedAmounts.map((amount) => money(amount, currency)),
    currency,
  );
  return recordOutstanding(
    money(input.totalAmount, currency),
    paid,
    input.kind,
    input.status,
    money(input.priorRetentionHeldRemaining ?? '0', currency),
  );
}

export function assertCustomerPaymentCurrencyMatch(
  paymentCurrency: string,
  invoiceCurrency: string,
): void {
  if (paymentCurrency.toUpperCase() !== invoiceCurrency.toUpperCase()) {
    throw new DomainRuleError(
      'Invoice currency must match payment currency',
      'billing.errors.paymentCurrencyMismatch',
      { paymentCurrency, invoiceCurrency },
    );
  }
}

/**
 * Validates a customer payment header + applications.
 * Partial allocation and unapplied remainder are allowed.
 * Applications may be empty (cash on account).
 */
export function assertCustomerPaymentApplicationsValid(input: {
  readonly currency: string;
  readonly paymentAmount: string;
  readonly clientId: string;
  readonly applications: readonly CustomerPaymentApplicationDraft[];
}): void {
  const currency = input.currency.toUpperCase();
  const paymentAmount = money(input.paymentAmount, currency);
  if (!isPositiveMoney(paymentAmount)) {
    throw new DomainRuleError(
      'Payment amount must be positive',
      'billing.errors.paymentOverApplied',
    );
  }

  let appliedSum = zeroMoney(currency);
  const seen = new Set<string>();

  for (const app of input.applications) {
    if (seen.has(app.billingRecordId)) {
      throw new DomainRuleError(
        'Duplicate invoice application in a single payment',
        'billing.errors.paymentDuplicateInvoice',
      );
    }
    seen.add(app.billingRecordId);

    assertPaymentTarget(app.status, app.kind);
    assertCustomerPaymentCurrencyMatch(currency, app.invoiceCurrency);

    if (!app.invoiceClientId || app.invoiceClientId !== input.clientId) {
      throw new DomainRuleError(
        'Payment client must match each invoice client',
        'billing.errors.paymentClientMismatch',
      );
    }

    const applied = money(app.amount, currency);
    if (!isPositiveMoney(applied)) {
      throw new DomainRuleError(
        'Application amount must be positive',
        'billing.errors.paymentOverApplied',
      );
    }

    const outstanding = computeInvoiceRemainingOutstanding({
      currency,
      totalAmount: app.totalAmount,
      kind: app.kind,
      status: app.status,
      priorAppliedAmounts: app.priorAppliedAmounts,
      priorRetentionHeldRemaining: app.priorRetentionHeldRemaining,
    });
    if (compareMoney(applied, outstanding) > 0) {
      throw new DomainRuleError(
        'Application exceeds receivable now',
        'billing.errors.paymentOverApplied',
      );
    }

    appliedSum = addMoney(appliedSum, applied);
  }

  if (compareMoney(appliedSum, paymentAmount) > 0) {
    throw new DomainRuleError(
      'Applications exceed payment amount',
      'billing.errors.applicationsExceedPayment',
    );
  }
}

/** Payment remaining after proposed applications - may be unapplied cash. */
export function computeCustomerPaymentUnapplied(input: {
  readonly currency: string;
  readonly paymentAmount: string;
  readonly applicationAmounts: readonly string[];
}) {
  const currency = input.currency.toUpperCase();
  const applied = sumMoney(
    input.applicationAmounts.map((amount) => money(amount, currency)),
    currency,
  );
  return subtractMoney(money(input.paymentAmount, currency), applied);
}
