/**
 * Compensation history domain types (Master Wave Agent 1).
 *
 * BUSINESS COST / employer cost only — not payroll net, not statutory Israeli payroll.
 * Physical persistence remains `rate_versions` + optional month facts (Lead/0021).
 * Framework-free: no React, Next.js, or DB imports.
 */

import type { LaborCostComponentRecord, RateUnit, RateVersionRecord } from './types';

/** Employment / costing basis — reuses existing rate_unit vocabulary. */
export type EmploymentBasis = RateUnit;

export const COMPENSATION_SOURCES = [
  'manual',
  'import',
  'adjustment',
  'system_derived',
] as const;
export type CompensationSource = (typeof COMPENSATION_SOURCES)[number];

export const EMPLOYER_COST_QUALITIES = ['estimated', 'actual'] as const;
export type EmployerCostQuality = (typeof EMPLOYER_COST_QUALITIES)[number];

/**
 * Product name for an effective-dated compensation row.
 * Persisted as `rate_versions` (keep table name for time_entry FK stability).
 */
export type CompensationVersionRecord = RateVersionRecord & {
  /** Stored estimated employer cost per `rateUnit`, if materialized; else compute. */
  readonly estimatedEmployerCost: string | null;
  readonly source: CompensationSource;
  /**
   * On versions, V1 is always `estimated`. Actual employer cost lives on month facts.
   */
  readonly costQuality: 'estimated';
  /** When set, money fields and components must not be silently rewritten. */
  readonly lockedAt: Date | null;
};

export type CompensationVersionDetail = CompensationVersionRecord & {
  readonly components: readonly LaborCostComponentRecord[];
};

/**
 * Calendar-month employer cost fact (optional advanced).
 * Does not create project/org Actual by existing — Agent 3 owns recognition rules.
 */
export interface EmployerCostMonthRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly employeeId: string;
  /** First day of month (`YYYY-MM-01`). */
  readonly month: string;
  readonly currency: string;
  /** Optional month gross/base (employer-facing), not net salary. */
  readonly grossBase: string | null;
  readonly estimatedEmployerCost: string | null;
  /** When known; employer cost only. */
  readonly actualEmployerCost: string | null;
  readonly costQuality: EmployerCostQuality;
  readonly source: CompensationSource;
  /** CompensationVersion that informed the estimate, if any. */
  readonly rateVersionId: string | null;
  /** Prior month fact this row adjusts (corrections append; no silent rewrite). */
  readonly adjustsMonthId: string | null;
  readonly notes: string | null;
  readonly lockedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Semantic aliases for existing RateVersion money fields. */
export interface CompensationMoneySemantics {
  /** Maps to `base_rate` — gross/base business cost per unit. */
  readonly grossBasePerUnit: string;
  /** Maps to `burden_percent` — user-supplied estimate only; never magic default. */
  readonly estimatedBurdenPercent: string | null;
}

export function compensationSemanticsFromRateVersion(
  version: Pick<RateVersionRecord, 'baseRate' | 'burdenPercent' | 'rateUnit'>,
): CompensationMoneySemantics & { readonly employmentBasis: EmploymentBasis } {
  return {
    grossBasePerUnit: version.baseRate,
    estimatedBurdenPercent: version.burdenPercent,
    employmentBasis: version.rateUnit,
  };
}

/**
 * Whether a compensation version's money meaning may be edited in place.
 * Closed/locked versions require a new correcting version instead.
 */
export function isCompensationVersionMutable(version: {
  readonly validTo: string | null;
  readonly lockedAt?: Date | null;
}): boolean {
  if (version.lockedAt != null) return false;
  // Open-ended current version may still receive range close (`valid_to`);
  // money edits on already-closed ranges should go through corrections.
  return version.validTo == null;
}

export function isEmployerCostMonthMutable(month: {
  readonly costQuality: EmployerCostQuality;
  readonly lockedAt: Date | null;
}): boolean {
  if (month.lockedAt != null) return false;
  return month.costQuality !== 'actual';
}
