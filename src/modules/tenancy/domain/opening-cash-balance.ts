/**
 * Organization opening cash balance (no dedicated column).
 *
 * Stored in organization_settings like project_profitability_mode.
 * JSON: { amount, currency, asOf: YYYY-MM-DD }.
 */

import { isBusinessDate, type BusinessDate } from '@/shared/dates';

export const OPENING_CASH_BALANCE_SETTING_KEY = 'opening_cash_balance';

export interface OpeningCashBalance {
  readonly amount: string;
  readonly currency: string;
  readonly asOf: BusinessDate;
}

const AMOUNT_PATTERN = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

/** Parse the JSON setting. Missing or invalid values stay unset (null). */
export function parseOpeningCashBalance(value: unknown): OpeningCashBalance | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { amount?: unknown; currency?: unknown; asOf?: unknown };
  if (typeof raw.amount !== 'string' || !AMOUNT_PATTERN.test(raw.amount.trim())) return null;
  if (typeof raw.currency !== 'string' || !CURRENCY_PATTERN.test(raw.currency.trim())) return null;
  if (!isBusinessDate(raw.asOf)) return null;
  return {
    amount: raw.amount.trim(),
    currency: raw.currency.trim().toUpperCase(),
    asOf: raw.asOf,
  };
}
