import { subtractMoney, type MoneyValue } from '@/shared/money';

/**
 * Lifetime cash difference from recorded receipts and recorded payments.
 * Net and gross each use the stored VAT of those movements. Gross is not
 * derived by dividing either side by a flat rate.
 */
export function lifetimeCashDifference(input: {
  readonly receivedNet: MoneyValue;
  readonly receivedGross: MoneyValue;
  readonly paidNet: MoneyValue;
  readonly paidGross: MoneyValue;
}): { readonly net: MoneyValue; readonly gross: MoneyValue } {
  return {
    net: subtractMoney(input.receivedNet, input.paidNet),
    gross: subtractMoney(input.receivedGross, input.paidGross),
  };
}
