import {
  addDays,
  coerceBusinessDate,
  compareBusinessDates,
  isBefore,
  type BusinessDate,
} from '@/shared/dates';
import type { RateVersionRecord } from './types';

/**
 * Owner rule: initial salary effective date = employment start (hireDate).
 * Never invent dates — only realign when hireDate is known and the employee
 * still has a single open-ended initial compensation version.
 */
export function resolveInitialCompensationValidFrom(input: {
  readonly hireDate: string | null | undefined;
  readonly explicitValidFrom?: string | null;
}): BusinessDate | null {
  if (input.hireDate) return coerceBusinessDate(input.hireDate);
  if (input.explicitValidFrom) return coerceBusinessDate(input.explicitValidFrom);
  return null;
}

/**
 * Whether the sole initial compensation row may be realigned to hireDate.
 * Multi-version history (salary changes) must not be rewritten.
 */
export function canRealignInitialCompensationValidFrom(
  versions: readonly Pick<RateVersionRecord, 'id' | 'validFrom' | 'validTo'>[],
  hireDate: BusinessDate,
): { readonly rateVersionId: string; readonly previousValidFrom: BusinessDate } | null {
  if (versions.length !== 1) return null;
  const only = versions[0]!;
  if (only.validTo != null) return null;
  const previous = coerceBusinessDate(only.validFrom);
  if (previous === hireDate) return null;
  return { rateVersionId: only.id, previousValidFrom: previous };
}

type VersionSpan = Pick<RateVersionRecord, 'id' | 'validFrom' | 'validTo'>;

/**
 * Owner admin salary save plan.
 *
 * - Forward effective date → close open version, insert new (classic raise).
 * - Same or earlier effective date → correct the open version in place
 *   (retroactive correction of amount and/or start date).
 * Periods strictly before the chosen effective date stay unchanged except
 * the prior version's end boundary when it overlaps the new start.
 */
export type EmployeeSalarySavePlan =
  | { readonly kind: 'insert_first' }
  | {
      readonly kind: 'forward_change';
      readonly openRateVersionId: string;
      readonly closeValidTo: BusinessDate;
    }
  | {
      readonly kind: 'correct_open';
      readonly openRateVersionId: string;
      readonly priorRateVersionId: string | null;
      readonly priorNewValidTo: BusinessDate | null;
      /** Fully absorbed closed versions (range would become empty). */
      readonly supersedeRateVersionIds: readonly string[];
    };

export function planEmployeeSalarySave(input: {
  readonly versions: readonly VersionSpan[];
  readonly validFrom: string;
}): EmployeeSalarySavePlan {
  const validFrom = coerceBusinessDate(input.validFrom);
  const versions = [...input.versions].sort((left, right) =>
    compareBusinessDates(coerceBusinessDate(left.validFrom), coerceBusinessDate(right.validFrom)),
  );

  if (versions.length === 0) return { kind: 'insert_first' };

  const open = versions.find((version) => version.validTo == null);
  if (!open) return { kind: 'insert_first' };

  const openFrom = coerceBusinessDate(open.validFrom);

  if (isBefore(openFrom, validFrom)) {
    return {
      kind: 'forward_change',
      openRateVersionId: open.id,
      closeValidTo: addDays(validFrom, -1),
    };
  }

  const prior = versions.find((version) => {
    if (version.id === open.id) return false;
    const from = coerceBusinessDate(version.validFrom);
    const to = version.validTo ? coerceBusinessDate(version.validTo) : null;
    return isBefore(from, validFrom) && (to === null || compareBusinessDates(to, validFrom) >= 0);
  });

  const priorNewValidTo = prior ? addDays(validFrom, -1) : null;
  const priorFullySuperseded =
    prior &&
    priorNewValidTo != null &&
    compareBusinessDates(priorNewValidTo, coerceBusinessDate(prior.validFrom)) < 0;

  const supersedeRateVersionIds = versions
    .filter((version) => {
      if (version.id === open.id) return false;
      if (priorFullySuperseded && version.id === prior.id) return true;
      const from = coerceBusinessDate(version.validFrom);
      return !isBefore(from, validFrom) && version.id !== open.id;
    })
    .map((version) => version.id);

  return {
    kind: 'correct_open',
    openRateVersionId: open.id,
    priorRateVersionId: priorFullySuperseded ? null : (prior?.id ?? null),
    priorNewValidTo: priorFullySuperseded ? null : priorNewValidTo,
    supersedeRateVersionIds,
  };
}

/** Present salary history spans for Owner UI (no technical jargon). */
export function formatSalaryHistorySpan(input: {
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly openEndedLabel: string;
}): string {
  const from = coerceBusinessDate(input.validFrom);
  if (!input.validTo) return `${from} — ${input.openEndedLabel}`;
  return `${from} — ${coerceBusinessDate(input.validTo)}`;
}
