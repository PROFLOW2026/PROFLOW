import type { BillingKind, BillingRecordStatus } from '@/modules/billing/domain/types';
import type { PaymentAmountBasis } from '@/modules/billing/domain/revenue-position';
import {
  addMoney,
  compareMoney,
  isNegativeMoney,
  isZeroMoney,
  multiplyMoney,
  negateMoney,
  subtractMoney,
  toDecimalValue,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

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
  if (input.status === 'draft' || input.status === 'void') return null;

  const currency = input.subtotalAmount.currency;
  const billedNet =
    input.kind === 'credit_note' ? negateMoney(input.subtotalAmount) : input.subtotalAmount;
  const retentionNet =
    input.kind === 'credit_note' || isZeroMoney(input.retentionHeldRemaining)
      ? zeroMoney(currency)
      : input.retentionHeldRemaining;

  const grossUnsigned =
    input.taxAmount && !isZeroMoney(input.taxAmount)
      ? addMoney(input.subtotalAmount, input.taxAmount)
      : input.totalAmount;
  const netToGross = isZeroMoney(grossUnsigned)
    ? 1
    : toDecimalValue(input.subtotalAmount).dividedBy(toDecimalValue(grossUnsigned));

  let paidNet = zeroMoney(currency);
  for (const payment of input.payments) {
    if (payment.status !== 'recorded') continue;
    if (payment.amount.currency !== currency) continue;
    const contribution =
      (payment.amountBasis ?? 'net') === 'gross'
        ? multiplyMoney(payment.amount, netToGross)
        : payment.amount;
    paidNet = addMoney(paidNet, contribution);
  }

  const openNet = subtractMoney(subtractMoney(billedNet, paidNet), retentionNet);
  if (compareMoney(paidNet, billedNet) >= 0 && !isNegativeMoney(openNet)) {
    return zeroMoney(currency);
  }
  return openNet;
}
