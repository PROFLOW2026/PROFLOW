import Decimal from 'decimal.js';
import {
  isEligibleForContractWeightAllocation,
  normalizePricingMode,
  normalizeWorkKind,
  type PricingMode,
  type WorkKind,
} from '@/modules/financials/domain/work-pricing';
import {
  businessDate,
  daysBetween,
  maxBusinessDate,
  minBusinessDate,
  type BusinessDate,
} from '@/shared/dates';
import type { ProjectWeightBasis, WeightAllocationMethod } from './types';

/** Project statuses that never receive automatic shared/overhead allocation. */
const INELIGIBLE_STATUSES = new Set(['draft', 'cancelled', 'archived']);

export interface AllocationPeriod {
  readonly start: BusinessDate;
  readonly end: BusinessDate;
}

export interface ProjectEligibilityFacts {
  readonly id: string;
  readonly status: string;
  readonly startDate: BusinessDate | null;
  /** Prefer actual end; fall back to target when actual is unset. */
  readonly actualEndDate: BusinessDate | null;
  readonly targetEndDate: BusinessDate | null;
  readonly archivedAt: Date | string | null;
  /**
   * `project` | `job` - both are eligible for overhead when period-overlapping.
   * Defaults to `project` when unset (legacy fixtures / pre-0019 rows).
   */
  readonly workKind?: WorkKind | string | null;
  /**
   * Jobs: `fixed` | `open`. Classic projects: null.
   * Open-price jobs are excluded from `contract_weight` only.
   */
  readonly pricingMode?: PricingMode | string | null;
}

/**
 * Inclusive calendar-day count in [start, end].
 * Jan 1–Jan 31 → 31; one-day span → 1.
 */
export function countInclusiveDays(start: BusinessDate, end: BusinessDate): number {
  if (start > end) return 0;
  return daysBetween(start, end) + 1;
}

export function projectCalendarSpan(project: ProjectEligibilityFacts): {
  readonly start: BusinessDate;
  readonly end: BusinessDate;
} {
  return {
    start: businessDate(project.startDate ?? '0001-01-01'),
    end: businessDate(project.actualEndDate ?? project.targetEndDate ?? '9999-12-31'),
  };
}

/**
 * Inclusive overlap between project calendar span and slice period.
 * Returns 0 when there is no overlap (or project is ineligible).
 */
export function projectActiveDaysInSlice(
  project: ProjectEligibilityFacts,
  slice: AllocationPeriod,
): number {
  if (!isProjectEligibleInPeriod(project, slice)) return 0;
  const span = projectCalendarSpan(project);
  const overlapStart = maxBusinessDate(span.start, slice.start);
  const overlapEnd = minBusinessDate(span.end, slice.end);
  return countInclusiveDays(overlapStart, overlapEnd);
}

/** activeDays / sliceDays - 0 when the slice has no days. */
export function projectActiveFractionOfSlice(
  project: ProjectEligibilityFacts,
  slice: AllocationPeriod,
): number {
  const sliceDays = countInclusiveDays(slice.start, slice.end);
  if (sliceDays <= 0) return 0;
  return projectActiveDaysInSlice(project, slice) / sliceDays;
}

/**
 * How active-day exposure combines with the selected driver.
 *
 * - `multiply`: effective_weight = driver_basis × (activeDays / sliceDays)
 *   Used for contract_weight and equal_split (calendar exposure is not in the driver).
 * - `inherent`: driver already reflects activity inside the slice window
 *   (labor hours / direct costs queried for the slice) - do NOT multiply again.
 */
export type ActiveDayExposurePolicy = 'multiply' | 'inherent';

export function activeDayExposurePolicyForMethod(
  method: WeightAllocationMethod,
): ActiveDayExposurePolicy {
  switch (method) {
    case 'labor_hours_weight':
    case 'direct_cost_weight':
      return 'inherent';
    case 'contract_weight':
    case 'equal_split':
      return 'multiply';
    default: {
      const _exhaustive: never = method;
      return _exhaustive;
    }
  }
}

/**
 * Applies partial-slice active-day exposure to weight bases when the driver
 * policy requires it. Projects with zero active days are dropped.
 *
 * equal_split: basis becomes activeDays (equal per active day in the slice).
 * contract_weight: basis becomes contractNet × activeFraction.
 */
export function applyActiveDayExposureToBases(input: {
  readonly method: WeightAllocationMethod;
  readonly slice: AllocationPeriod;
  readonly projects: readonly ProjectEligibilityFacts[];
  readonly bases: readonly ProjectWeightBasis[];
}): ProjectWeightBasis[] {
  const policy = activeDayExposurePolicyForMethod(input.method);
  if (policy === 'inherent') {
    return input.bases.slice();
  }

  const byId = new Map(input.projects.map((project) => [project.id, project]));
  const sliceDays = countInclusiveDays(input.slice.start, input.slice.end);
  if (sliceDays <= 0) return [];

  const adjusted: ProjectWeightBasis[] = [];
  for (const base of input.bases) {
    const project = byId.get(base.projectId);
    if (!project) continue;
    const activeDays = projectActiveDaysInSlice(project, input.slice);
    if (activeDays <= 0) continue;

    if (input.method === 'equal_split') {
      adjusted.push({
        projectId: base.projectId,
        basisValue: String(activeDays),
        basisUnit: 'count',
      });
      continue;
    }

    // contract_weight (and any future multiply drivers): driver × activeFraction
    const adjustedBasis = new Decimal(base.basisValue)
      .times(activeDays)
      .dividedBy(sliceDays)
      .toFixed(6);
    adjusted.push({
      projectId: base.projectId,
      basisValue: adjustedBasis,
      basisUnit: base.basisUnit,
    });
  }

  return adjusted.sort((a, b) => a.projectId.localeCompare(b.projectId));
}

/**
 * A project is eligible when it is not archived/cancelled/draft and its
 * calendar span overlaps the allocation period (inclusive). Mid-period
 * starts and ends are included; open-ended projects (null end) stay eligible.
 */
export function isProjectEligibleInPeriod(
  project: ProjectEligibilityFacts,
  period: AllocationPeriod,
): boolean {
  if (project.archivedAt) return false;
  if (INELIGIBLE_STATUSES.has(project.status)) return false;
  if (period.start > period.end) return false;

  const projectStart = project.startDate ?? '0001-01-01';
  const projectEnd = project.actualEndDate ?? project.targetEndDate ?? '9999-12-31';

  return projectStart <= period.end && projectEnd >= period.start;
}

export function selectEligibleProjects(
  projects: readonly ProjectEligibilityFacts[],
  period: AllocationPeriod,
  /** When provided, only these ids may be considered (still period-filtered). */
  explicitProjectIds?: readonly string[] | null,
): ProjectEligibilityFacts[] {
  const allow = explicitProjectIds?.length
    ? new Set(explicitProjectIds)
    : null;

  return projects
    .filter((project) => (allow ? allow.has(project.id) : true))
    .filter((project) => isProjectEligibleInPeriod(project, period))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Period-eligible projects/jobs, then method-specific revenue-basis gate.
 *
 * - Jobs and projects share the same eligibility calendar (active-day overlap).
 * - `contract_weight`: EXCLUDE open-price jobs (no invented contract value).
 * - Other weight drivers: open-price jobs stay eligible (cost/labor/equal basis).
 */
export function selectEligibleProjectsForMethod(
  projects: readonly ProjectEligibilityFacts[],
  period: AllocationPeriod,
  method: WeightAllocationMethod,
  explicitProjectIds?: readonly string[] | null,
): ProjectEligibilityFacts[] {
  const periodEligible = selectEligibleProjects(projects, period, explicitProjectIds);
  if (method !== 'contract_weight') return periodEligible;

  return periodEligible.filter((project) =>
    isEligibleForContractWeightAllocation(
      normalizeWorkKind(project.workKind),
      normalizePricingMode(project.pricingMode ?? null),
    ),
  );
}

export function assertValidAllocationPeriod(period: AllocationPeriod): void {
  if (period.start > period.end) {
    throw new Error('allocation_period_start must be on or before allocation_period_end');
  }
}
