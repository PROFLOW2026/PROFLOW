import { businessDate, coerceBusinessDate, compareBusinessDates, selectEffective, type BusinessDate } from '@/shared/dates';
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
    validFrom: coerceBusinessDate(version.validFrom),
    validTo: version.validTo ? coerceBusinessDate(version.validTo) : null,
  }));
  return selectEffective(dated, date);
}

/**
 * Rate lookup for labor costing — includes same-calendar-month coherence when
 * compensation was configured after earlier days in that month (Owner entered
 * salary mid-month for work already logged).
 */
export function resolveRateVersionForCosting(
  versions: readonly RateVersionRecord[],
  on: BusinessDate | string,
): RateVersionRecord | null {
  const direct = resolveRateVersionForDate(versions, on);
  if (direct) return direct;

  const date = typeof on === 'string' ? businessDate(on) : on;
  const workMonth = date.slice(0, 7);
  let fallback: RateVersionRecord | null = null;

  for (const version of versions) {
    const validFrom = coerceBusinessDate(version.validFrom);
    if (validFrom.slice(0, 7) !== workMonth) continue;
    if (compareBusinessDates(validFrom, date) <= 0) continue;
    if (
      !fallback ||
      compareBusinessDates(coerceBusinessDate(fallback.validFrom), validFrom) > 0
    ) {
      fallback = version;
    }
  }

  return fallback;
}

/**
 * Current salary for list/detail display when a rate row exists but does not
 * yet cover "today" (e.g. Owner still correcting the effective date).
 * Prefer the version in force on `asOf`, else the open-ended configured salary.
 */
export function resolveCurrentCompensationForDisplay(
  versions: readonly RateVersionRecord[],
  asOf: BusinessDate | string,
): RateVersionRecord | null {
  const direct = resolveRateVersionForDate(versions, asOf);
  if (direct) return direct;

  let open: RateVersionRecord | null = null;
  for (const version of versions) {
    if (version.validTo != null) continue;
    if (
      !open ||
      compareBusinessDates(
        coerceBusinessDate(version.validFrom),
        coerceBusinessDate(open.validFrom),
      ) > 0
    ) {
      open = version;
    }
  }
  return open;
}
