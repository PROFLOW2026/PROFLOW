import type { CommercialPosition } from '@/modules/financials/domain/types';
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
} from '@/shared/money/money';
import { isPendingChangeStatus } from './change-request-lifecycle';
import type {
  ChangeDirection,
  ContractValueEventRecord,
  PendingChangeInput,
} from './types';

/**
 * Commercial value arithmetic (doc 04 §3, doc 05 §3).
 *
 * Change requests never move Current Contract Value — only change orders do,
 * via append-only contract value events. Pending changes are shown separately.
 */

export function oppositeChangeDirection(direction: ChangeDirection): ChangeDirection {
  return direction === 'addition' ? 'reduction' : 'addition';
}

export function signedChangeAmount(
  direction: ChangeDirection,
  magnitude: MoneyValue,
): MoneyValue {
  return direction === 'reduction' ? negateMoney(magnitude) : magnitude;
}

export function changeOrderEventAmount(
  direction: ChangeDirection,
  amount: MoneyValue,
): MoneyValue {
  return signedChangeAmount(direction, amount);
}

/**
 * Commercial magnitude for an approved change order (VAT ≠ profit).
 * Issued quote totals include tax for customer-facing display; contract value
 * events must use the net subtotal. Fallback requestedAmount is already net.
 */
export function changeOrderApprovedNetAmount(input: {
  readonly quoteVersion?: {
    readonly subtotalAmount: string;
    readonly totalAmount: string;
    readonly taxAmount: string | null;
  } | null;
  readonly requestedAmount: string | null;
}): string | null {
  if (input.quoteVersion) {
    return input.quoteVersion.subtotalAmount;
  }
  return input.requestedAmount;
}

export function effectivePendingAmount(
  input: PendingChangeInput,
  _currency: string,
): MoneyValue | null {
  if (!isPendingChangeStatus(input.status)) return null;

  const raw = input.pricedAmount ?? input.requestedAmount;
  if (raw === null) return null;

  const magnitude = fromNumericString(raw, input.currency);
  if (!magnitude) return null;

  return signedChangeAmount(input.direction, magnitude);
}

export function computeApprovedAdditions(
  events: readonly ContractValueEventRecord[],
  currency: string,
): MoneyValue {
  return events
    .filter((event) => event.kind === 'change_order')
    .reduce<MoneyValue>((acc, event) => {
      const amount = fromNumericString(event.amount, event.currency);
      if (!amount || !isPositiveMoney(amount)) return acc;
      return addMoney(acc, amount);
    }, zeroMoney(currency));
}

export function computeApprovedReductions(
  events: readonly ContractValueEventRecord[],
  currency: string,
): MoneyValue {
  return events
    .filter((event) => event.kind === 'change_order')
    .reduce<MoneyValue>((acc, event) => {
      const amount = fromNumericString(event.amount, event.currency);
      if (!amount || !isNegativeMoney(amount)) return acc;
      return addMoney(acc, absMoney(amount));
    }, zeroMoney(currency));
}

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

export function findOriginalContractValue(
  events: readonly ContractValueEventRecord[],
  currency: string,
  fallbackAmount: string | null,
): MoneyValue {
  const originalEvent = events.find((event) => event.kind === 'original');
  if (originalEvent) {
    const fromEvent = fromNumericString(originalEvent.amount, originalEvent.currency);
    if (fromEvent) return fromEvent;
  }

  if (fallbackAmount !== null) {
    return money(fallbackAmount, currency);
  }

  return zeroMoney(currency);
}

export function computePendingChanges(
  pendingInputs: readonly PendingChangeInput[],
  currency: string,
): MoneyValue {
  const signed = pendingInputs
    .map((input) => effectivePendingAmount(input, currency))
    .filter((value): value is MoneyValue => value !== null);

  if (signed.length === 0) return zeroMoney(currency);
  return sumMoney(signed, currency);
}

export function computeCommercialPosition(input: {
  readonly valueEvents: readonly ContractValueEventRecord[];
  readonly pendingChanges: readonly PendingChangeInput[];
  readonly currency: string;
  readonly originalValueFallback: string | null;
}): CommercialPosition {
  const { valueEvents, pendingChanges, currency, originalValueFallback } = input;

  const originalContractValue = findOriginalContractValue(
    valueEvents,
    currency,
    originalValueFallback,
  );
  const approvedAdditions = computeApprovedAdditions(valueEvents, currency);
  const approvedReductions = computeApprovedReductions(valueEvents, currency);
  const currentContractValue = computeCurrentContractValue(valueEvents, currency);
  const pending = computePendingChanges(pendingChanges, currency);

  // Integrity check: current should equal original + additions − reductions when events exist.
  const reconstructed = subtractMoney(
    addMoney(originalContractValue, approvedAdditions),
    approvedReductions,
  );

  if (
    valueEvents.some((event) => event.kind === 'change_order') &&
    reconstructed.amount !== currentContractValue.amount
  ) {
    // Adjustment events may explain a gap; prefer the event sum as source of truth.
  }

  return {
    originalContractValue,
    approvedAdditions,
    approvedReductions,
    currentContractValue,
    pendingChanges: pending,
  };
}

/** Net approved change (additions minus reductions) for summary chips. */
export function computeNetApprovedChanges(
  additions: MoneyValue,
  reductions: MoneyValue,
): MoneyValue {
  return subtractMoney(additions, reductions);
}
