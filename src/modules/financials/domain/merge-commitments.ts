import { addMoney, roundMoney, zeroMoney, type MoneyValue } from '@/shared/money';

/** Merge PO open committed with incremental subcontract remaining (R-003). */
export function mergeProjectRemainingCommitments(input: {
  readonly currency: string;
  readonly poCommitted: MoneyValue;
  readonly subcontractRemaining: MoneyValue;
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  const zero = zeroMoney(currency);
  const po =
    input.poCommitted.currency.toUpperCase() === currency ? input.poCommitted : zero;
  const sub =
    input.subcontractRemaining.currency.toUpperCase() === currency
      ? input.subcontractRemaining
      : zero;
  return roundMoney(addMoney(po, sub));
}
