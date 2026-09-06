/** Canonical quick-select payment method keys stored on expenses.payment_method. */
export const PAYMENT_METHOD_KEYS = ['check', 'credit_card', 'transfer', 'other'] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number];

export function isPaymentMethodKey(value: string): value is PaymentMethodKey {
  return (PAYMENT_METHOD_KEYS as readonly string[]).includes(value);
}

/** Credit-card expenses may carry a saved org instrument id (0081). */
export const PAYMENT_METHOD_CREDIT_CARD: PaymentMethodKey = 'credit_card';
