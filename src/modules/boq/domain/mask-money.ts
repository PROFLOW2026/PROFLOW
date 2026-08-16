/**
 * Worker / field masking - zeros commercial money without changing quantities.
 *
 * Used by workspace + progress reads when the viewer lacks money permissions,
 * and by the dedicated field-measure DTO (which omits money keys entirely).
 */

export function maskBoqNodeMoney<
  T extends {
    originalUnitPrice: string;
    originalAmount: string;
    currentUnitPrice: string;
    currentAmount: string;
  },
>(node: T): T {
  return {
    ...node,
    originalUnitPrice: '0',
    originalAmount: '0',
    currentUnitPrice: '0',
    currentAmount: '0',
  };
}

export function maskProgressLineMoney<
  T extends {
    unitPriceSnapshot: string;
    periodAmount: string;
  },
>(line: T): T {
  return {
    ...line,
    unitPriceSnapshot: '0',
    periodAmount: '0',
  };
}

/** Keys that must never appear on a field-measure DTO. */
export const FIELD_MEASURE_FORBIDDEN_MONEY_KEYS = [
  'originalUnitPrice',
  'originalAmount',
  'currentUnitPrice',
  'currentAmount',
  'unitPriceSnapshot',
  'periodAmount',
  'unitRate',
  'amount',
  'allocatedApprovedAmount',
] as const;
