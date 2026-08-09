import { businessDate, selectEffective, type BusinessDate } from '@/shared/dates';
import type { RateVersionRecord } from './types';

/**
 * Resolves the rate version in force on a business date (doc 06 §5).
 *
 * Delegates to the shared effective-dating primitive so boundary rules stay
 * consistent with tax rules and other dated configuration.
 */
export function resolveRateVersionForDate(
  versions: readonly RateVersionRecord[],
  on: BusinessDate | string,
): RateVersionRecord | null {
  const date = typeof on === 'string' ? businessDate(on) : on;
  const dated = versions.map((version) => ({
    ...version,
    validFrom: businessDate(version.validFrom),
    validTo: version.validTo ? businessDate(version.validTo) : null,
  }));
  return selectEffective(dated, date);
}
