import { addMoney, fromNumericString, sumMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import type { ContractValueEventRecord } from './types';

/**
 * Derives current contract value by summing append-only value events (doc 05 §12).
 * Change orders from workstream 3 append events with kind `change_order`.
 */
export function computeCurrentContractValue(
  events: readonly ContractValueEventRecord[],
  currency: string,
): MoneyValue {
  const values = events
    .map((event) => fromNumericString(event.amount, event.currency))
    .filter((value): value is MoneyValue => value !== null);

  if (values.length === 0) return zeroMoney(currency);
  return sumMoney(values, currency);
}

export function computeApprovedChangesTotal(
  events: readonly ContractValueEventRecord[],
  currency: string,
): MoneyValue {
  const changeEvents = events.filter((event) => event.kind === 'change_order');
  if (changeEvents.length === 0) return zeroMoney(currency);

  return changeEvents.reduce<MoneyValue>((acc, event) => {
    const amount = fromNumericString(event.amount, event.currency);
    if (!amount) return acc;
    return addMoney(acc, amount);
  }, zeroMoney(currency));
}

export function findOriginalValueEvent(
  events: readonly ContractValueEventRecord[],
): ContractValueEventRecord | null {
  return events.find((event) => event.kind === 'original') ?? null;
}
