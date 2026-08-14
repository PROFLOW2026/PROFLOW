import { money, multiplyMoney, toNumericString } from '@/shared/money';

/**
 * When a replacement has no labor cost snapshot, threshold rules still need a
 * comparable amount. Hours × this sentinel rate (1 per hour) stays in org
 * currency without inventing Actual labor cost.
 */
export const TIME_CORRECTION_AMOUNT_SENTINEL_RATE = '1';

/**
 * Amount + currency submitted to the `time_correction` approval gate.
 * Prefers the replacement cost snapshot; otherwise hours × sentinel.
 */
export function resolveTimeCorrectionApprovalAmount(input: {
  readonly costAmount: string | null | undefined;
  readonly costCurrency: string | null | undefined;
  readonly hours: string;
  readonly orgBaseCurrency: string | null | undefined;
}): { readonly amount: string; readonly currency: string } {
  const orgCurrency = input.orgBaseCurrency?.trim().toUpperCase() || null;
  const costCurrency = input.costCurrency?.trim().toUpperCase() || null;
  const costAmount = input.costAmount?.trim() || null;

  if (costAmount) {
    return {
      amount: costAmount,
      currency: costCurrency ?? orgCurrency ?? 'ILS',
    };
  }

  const currency = orgCurrency ?? costCurrency ?? 'ILS';
  return {
    amount: toNumericString(
      multiplyMoney(money(TIME_CORRECTION_AMOUNT_SENTINEL_RATE, currency), input.hours),
    ),
    currency,
  };
}
