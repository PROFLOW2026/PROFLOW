import { DomainRuleError } from '@/shared/errors';
import type { RecurrenceCadence } from './types';

const CADENCES: readonly RecurrenceCadence[] = ['one_time', 'monthly', 'quarterly', 'yearly', 'custom'];

export function isRecurrenceCadence(value: string): value is RecurrenceCadence {
  return (CADENCES as readonly string[]).includes(value);
}

/**
 * Serialises recurrence for `expenses.recurrence_rule`.
 * Custom cadence stores `custom:<user text>`; V1 does not generate future rows.
 */
export function encodeRecurrenceRule(cadence: RecurrenceCadence, customLabel?: string | null): string | null {
  if (cadence === 'one_time') return null;
  if (cadence === 'custom') {
    const label = customLabel?.trim();
    if (!label) {
      throw new DomainRuleError(
        'Custom recurrence requires a description',
        'expenses.errors.customRecurrenceRequired',
      );
    }
    return `custom:${label}`;
  }
  return cadence;
}

export function decodeRecurrenceRule(rule: string | null | undefined): {
  cadence: RecurrenceCadence;
  customLabel: string | null;
} {
  if (!rule) return { cadence: 'one_time', customLabel: null };
  if (isRecurrenceCadence(rule)) return { cadence: rule, customLabel: null };
  if (rule.startsWith('custom:')) {
    return { cadence: 'custom', customLabel: rule.slice('custom:'.length) };
  }
  return { cadence: 'one_time', customLabel: null };
}
