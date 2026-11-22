import type { BillingKind, BillingRecordStatus } from '@/modules/billing/domain/types';
import type { PaymentAmountBasis } from '@/modules/billing/domain/revenue-position';
import { computeRecordRevenuePosition } from '@/modules/billing/domain/revenue-position';
import type { MoneyValue } from '@/shared/money';

export interface ReportOpenNetPayment {
  readonly amount: MoneyValue;
  readonly amountBasis?: PaymentAmountBasis;
  readonly status: 'recorded' | 'void';
}

/**
 * Open net used by the org-report SQL aggregate.
 * Same settlement as `computeRecordRevenuePosition` without loading billing rows:
 * draft/void have no position, credit notes negate subtotal, gross payments
 * convert with net/gross (half-up to storage scale), retention held is net
 * except on credit notes, and a non-negative remainder is zero once paid
 * covers billed.
 */
export function reportBillingOpenNet(input: {
  readonly kind: BillingKind;
  readonly status: BillingRecordStatus;
  readonly subtotalAmount: MoneyValue;
  readonly taxAmount: MoneyValue | null;
  readonly totalAmount: MoneyValue;
  readonly retentionHeldRemaining: MoneyValue;
  readonly payments: readonly ReportOpenNetPayment[];
}): MoneyValue | null {
  return (
    computeRecordRevenuePosition(
      {
        kind: input.kind,
        status: input.status,
        totalAmount: input.totalAmount,
        subtotalAmount: input.subtotalAmount,
        taxAmount: input.taxAmount,
        payments: input.payments,
        retentionHeldRemaining: input.retentionHeldRemaining,
      },
      input.subtotalAmount.currency,
    )?.open.net ?? null
  );
}