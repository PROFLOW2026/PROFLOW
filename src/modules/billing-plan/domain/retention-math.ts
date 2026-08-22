/**
 * Cycle retention helpers — wrap @/modules/retention; never invent a second engine.
 * Retention is cash timing only; it does not reduce recognized billed amounts.
 */

import { resolveRetentionCapture } from '@/modules/retention';
import {
  addMoney,
  money,
  toNumericString,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

export function resolveCycleLineRetention(input: {
  readonly lineAmount: string;
  readonly currency: string;
  readonly retentionAmount?: string | null;
  readonly retentionPercent?: string | null;
}): MoneyValue {
  return resolveRetentionCapture({
    totalAmount: input.lineAmount,
    currency: input.currency,
    retentionAmount: input.retentionAmount,
    retentionPercent: input.retentionPercent,
    side: 'ar',
  });
}

export function resolveCycleRetention(input: {
  readonly cycleTotal: string;
  readonly currency: string;
  readonly retentionAmount?: string | null;
  readonly retentionPercent?: string | null;
}): MoneyValue {
  return resolveRetentionCapture({
    totalAmount: input.cycleTotal,
    currency: input.currency,
    retentionAmount: input.retentionAmount,
    retentionPercent: input.retentionPercent,
    side: 'ar',
  });
}

/**
 * Prefer line override → cycle percent → plan default.
 * Amount wins over percent when both provided (retention module rule).
 */
export function resolveEffectiveRetentionPercent(input: {
  readonly lineOverride?: string | null;
  readonly cyclePercent?: string | null;
  readonly planDefault?: string | null;
}): string | null {
  const candidates = [input.lineOverride, input.cyclePercent, input.planDefault];
  for (const value of candidates) {
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return null;
}

/** Accumulate retention captured across issued cycles (reporting only). */
export function accumulateRetention(
  currency: string,
  amounts: readonly string[],
): MoneyValue {
  return amounts.reduce<MoneyValue>(
    (acc, raw) => addMoney(acc, money(raw, currency)),
    zeroMoney(currency),
  );
}

export function retentionToNumericString(value: MoneyValue): string {
  return toNumericString(value);
}
