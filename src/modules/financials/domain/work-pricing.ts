/**
 * Project / job work-kind and pricing-mode helpers for financial parity.
 * Jobs reuse the same financial engine; open-price gates revenue / margin only.
 */

export type WorkKind = 'project' | 'job' | 'work_order';
export type PricingMode = 'fixed' | 'open' | null;
/** Org dashboard / reports scope — never double-counts across kinds. */
export type WorkKindFilter = 'all' | 'project' | 'job';

export function normalizeWorkKind(value: string | null | undefined): WorkKind {
  if (value === 'job') return 'job';
  if (value === 'work_order') return 'work_order';
  return 'project';
}

export function normalizePricingMode(value: string | null | undefined): PricingMode {
  if (value === 'fixed' || value === 'open') return value;
  return null;
}

/**
 * Open-price job: costs / commitments accumulate; no revenue basis yet.
 * Classic projects (`work_kind=project`, `pricing_mode=null`) are never open-price.
 */
export function isOpenPriceJob(
  workKind: string | null | undefined,
  pricingMode: string | null | undefined,
): boolean {
  const kind = normalizeWorkKind(workKind);
  return (
    (kind === 'job' || kind === 'work_order') && normalizePricingMode(pricingMode) === 'open'
  );
}

export interface RevenueBasisOptions {
  /**
   * When known: whether a primary managed contract exists for this row.
   * Jobs without a managed contract must not claim profit (same spirit as
   * `isJobProfitDefined`). Classic projects omit this / leave undefined so
   * intentionally-zero or mid-setup contracts keep prior behavior.
   */
  readonly hasManagedContract?: boolean;
}

/**
 * Profit / margin require a managed revenue basis.
 * - Open-price jobs: never
 * - Jobs with `hasManagedContract === false`: never
 * - Classic projects: gated only by open-price (which they never are)
 */
export function hasRevenueBasisForProfitability(
  workKind: string | null | undefined,
  pricingMode: string | null | undefined,
  options?: RevenueBasisOptions,
): boolean {
  if (isOpenPriceJob(workKind, pricingMode)) return false;
  const kind = normalizeWorkKind(workKind);
  if (
    (kind === 'job' || kind === 'work_order') &&
    options?.hasManagedContract === false
  ) {
    return false;
  }
  return true;
}

/**
 * `contract_weight` must not invent a fake contract for open-price jobs.
 * Other drivers (labor hours, direct cost, equal_split) still include them.
 * (Eligibility uses pricing_mode only — open jobs never carry a managed contract.)
 */
export function isEligibleForContractWeightAllocation(
  workKind: string | null | undefined,
  pricingMode: string | null | undefined,
): boolean {
  return hasRevenueBasisForProfitability(workKind, pricingMode);
}

export function matchesWorkKindFilter(
  workKind: string | null | undefined,
  filter: WorkKindFilter,
): boolean {
  if (filter === 'all') return true;
  const kind = normalizeWorkKind(workKind);
  // Work orders are neither classic projects nor jobs in rollup facets.
  if (kind === 'work_order') return false;
  return kind === filter;
}

export function parseWorkKindFilter(
  value: WorkKindFilter | string | null | undefined,
): WorkKindFilter {
  if (value === 'project' || value === 'job' || value === 'all') return value;
  return 'all';
}
