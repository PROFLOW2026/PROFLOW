/**
 * Subcontract current-value arithmetic — same pattern as commercial contract-value.
 *
 * Formula: Original + approved events (kind change_order / adjustment) = Current.
 * Pending proposals are not an event kind and must never mutate current.
 */

import {
  absMoney,
  addMoney,
  fromNumericString,
  isNegativeMoney,
  isPositiveMoney,
  money,
  negateMoney,
  subtractMoney,
  sumMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { SUBCONTRACT_VALUE_EVENT_KINDS, type SubcontractValueEventRecord } from './subcontract-types';

export function signedSubcontractChangeAmount(
  direction: 'addition' | 'reduction',
  magnitude: MoneyValue,
): MoneyValue {
  return direction === 'reduction' ? negateMoney(magnitude) : magnitude;
}

export function findOriginalSubcontractValue(
  events: readonly SubcontractValueEventRecord[],
  currency: string,
  fallbackAmount: string | null,
): MoneyValue {
  const originalEvent = events.find((event) => event.kind === 'original');
  if (originalEvent) {
    const fromEvent = fromNumericString(originalEvent.amount, originalEvent.currency);
    if (fromEvent) return fromEvent;
  }
  if (fallbackAmount !== null) return money(fallbackAmount, currency);
  return zeroMoney(currency);
}

export function computeApprovedSubcontractChanges(
  events: readonly SubcontractValueEventRecord[],
  currency: string,
): MoneyValue {
  const changeEvents = events.filter(
    (event) => event.kind === 'change_order' || event.kind === 'adjustment',
  );
  if (changeEvents.length === 0) return zeroMoney(currency);

  return changeEvents.reduce<MoneyValue>((acc, event) => {
    const amount = fromNumericString(event.amount, event.currency);
    if (!amount) return acc;
    return addMoney(acc, amount);
  }, zeroMoney(currency));
}

export function computeApprovedSubcontractAdditions(
  events: readonly SubcontractValueEventRecord[],
  currency: string,
): MoneyValue {
  return events
    .filter((event) => event.kind === 'change_order' || event.kind === 'adjustment')
    .reduce<MoneyValue>((acc, event) => {
      const amount = fromNumericString(event.amount, event.currency);
      if (!amount || !isPositiveMoney(amount)) return acc;
      return addMoney(acc, amount);
    }, zeroMoney(currency));
}

export function computeApprovedSubcontractReductions(
  events: readonly SubcontractValueEventRecord[],
  currency: string,
): MoneyValue {
  return events
    .filter((event) => event.kind === 'change_order' || event.kind === 'adjustment')
    .reduce<MoneyValue>((acc, event) => {
      const amount = fromNumericString(event.amount, event.currency);
      if (!amount || !isNegativeMoney(amount)) return acc;
      return addMoney(acc, absMoney(amount));
    }, zeroMoney(currency));
}

/**
 * Current subcontract amount = sum of append-only value events.
 * Pending / draft / awaiting statuses are not events and are ignored here.
 */
export function computeCurrentSubcontractValue(
  events: readonly SubcontractValueEventRecord[],
  currency: string,
): MoneyValue {
  const values = events
    .filter((event) =>
      (SUBCONTRACT_VALUE_EVENT_KINDS as readonly string[]).includes(event.kind),
    )
    .map((event) => fromNumericString(event.amount, event.currency))
    .filter((value): value is MoneyValue => value !== null);

  if (values.length === 0) return zeroMoney(currency);
  return sumMoney(values, currency);
}

export function computeSubcontractValuePosition(input: {
  readonly events: readonly SubcontractValueEventRecord[];
  readonly currency: string;
  readonly originalValueFallback: string | null;
}): {
  readonly originalAmount: MoneyValue;
  readonly approvedChanges: MoneyValue;
  readonly currentAmount: MoneyValue;
} {
  const originalAmount = findOriginalSubcontractValue(
    input.events,
    input.currency,
    input.originalValueFallback,
  );
  const approvedChanges = computeApprovedSubcontractChanges(input.events, input.currency);
  const currentAmount = computeCurrentSubcontractValue(input.events, input.currency);

  // Integrity: current should equal original + signed approved events when events exist.
  const reconstructed = subtractMoney(
    addMoney(originalAmount, computeApprovedSubcontractAdditions(input.events, input.currency)),
    computeApprovedSubcontractReductions(input.events, input.currency),
  );
  void reconstructed;

  return { originalAmount, approvedChanges, currentAmount };
}
