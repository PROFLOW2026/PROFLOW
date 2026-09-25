import { addMoney, fromNumericString, sumMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import { contractContributesToCurrentValue } from './contract-lifecycle';
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

/**
 * Project header current value. Same live-contract rule as financials:
 * skip closed and cancelled contracts, then sum append-only events.
 * Pending change requests are not events and do not increase this total.
 */
export function computeHeaderCurrentContractValue(input: {
  readonly contracts: readonly {
    readonly id: string;
    readonly status: string;
    readonly isPrimary: boolean;
    readonly originalValueAmount: string | null;
  }[];
  readonly events: readonly ContractValueEventRecord[];
  readonly currency: string;
}): MoneyValue {
  const liveIds = new Set(
    input.contracts
      .filter((contract) => contractContributesToCurrentValue(contract.status))
      .map((contract) => contract.id),
  );
  const events = input.events.filter(
    (event) =>
      liveIds.has(event.contractId) &&
      event.currency.toUpperCase() === input.currency.toUpperCase(),
  );
  if (events.length > 0) {
    return computeCurrentContractValue(events, input.currency);
  }
  const live = input.contracts.filter((contract) => liveIds.has(contract.id));
  const primary = live.find((contract) => contract.isPrimary) ?? live[0];
  if (primary?.originalValueAmount) {
    return fromNumericString(primary.originalValueAmount, input.currency) ?? zeroMoney(input.currency);
  }
  return zeroMoney(input.currency);
}

export function findOriginalValueEvent(
  events: readonly ContractValueEventRecord[],
): ContractValueEventRecord | null {
  return events.find((event) => event.kind === 'original') ?? null;
}

/**
 * Original contract amount / VAT mode may be edited only until a finalized
 * contract-value event exists. Draft / awaiting / rejected / cancelled change
 * requests do not create these events and therefore do not lock.
 *
 * Authoritative signal: `change_order` (approved CO) or `adjustment` events.
 */
export function isOriginalContractAmountLocked(
  events: readonly ContractValueEventRecord[],
): boolean {
  return events.some((event) => event.kind === 'change_order' || event.kind === 'adjustment');
}
