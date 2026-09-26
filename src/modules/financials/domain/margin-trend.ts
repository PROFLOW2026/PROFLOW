import type { ProjectProfitabilityMode } from '@/modules/tenancy/domain/project-profitability-mode';
import type { MoneyValue } from '@/shared/money/money';

/**
 * Monthly margin trend decisions.
 *
 * Snapshots copy an already-composed project view. They do not recompute profit.
 * Only the current calendar month may be written, and never when that month is
 * a closed month-close period. Older months are never rewritten.
 */

const YEAR_MONTH_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

export type MarginPeriodStatus = 'open' | 'ready' | 'closed' | null;

export type MarginSnapshotWriteDecision =
  | { readonly write: true; readonly yearMonth: string }
  | {
      readonly write: false;
      readonly reason: 'invalid_month' | 'not_current_month' | 'closed_period';
    };

export interface ComposedMarginSource {
  readonly currency: string;
  readonly projectProfitabilityMode?: ProjectProfitabilityMode | null;
  readonly commercial: {
    readonly currentContractValue: MoneyValue;
  } | null;
  readonly cost: {
    readonly actualCostToDate: MoneyValue;
    readonly directActualCostToDate: MoneyValue;
    readonly fullActualCostToDate: MoneyValue;
    readonly estimatedFinalCost: MoneyValue;
    readonly directForecastFinalCost: MoneyValue;
    readonly fullForecastFinalCost: MoneyValue;
  };
  readonly profit: {
    readonly estimatedProfit: MoneyValue;
    readonly marginPercent: string | null;
    readonly actualProfit: MoneyValue;
    readonly actualMarginPercent: string | null;
  } | null;
}

/** Amounts copied from a composed result. Null when contract value is unavailable. */
export interface MarginSnapshotAmounts {
  readonly currency: string;
  readonly contractValue: string;
  readonly actualCost: string;
  readonly forecastCost: string;
  readonly actualMargin: string | null;
  readonly forecastMargin: string | null;
  readonly actualMarginPercent: string | null;
  readonly forecastMarginPercent: string | null;
}

export interface MarginTrendPoint {
  readonly yearMonth: string;
  readonly currency: string;
  readonly contractValue: string;
  readonly actualCost: string;
  readonly forecastCost: string;
  readonly actualMargin: string | null;
  readonly forecastMargin: string | null;
}

/** Current calendar month (YYYY-MM) in the organization timezone, else UTC. */
export function marginYearMonthKey(
  timeZone: string | null | undefined,
  now: Date = new Date(),
): string {
  const zone = timeZone?.trim() || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(now);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    if (year && month && YEAR_MONTH_RE.test(`${year}-${month}`)) {
      return `${year}-${month}`;
    }
  } catch {
    // Invalid IANA zone — fall through to the UTC calendar date.
  }
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
}

/**
 * Write only the current month, and only when that month-close period is not closed.
 * A missing period is not closed. Older months are refused even when still open.
 */
export function decideMarginSnapshotWrite(input: {
  readonly targetYearMonth: string;
  readonly currentYearMonth: string;
  readonly periodStatus: MarginPeriodStatus;
}): MarginSnapshotWriteDecision {
  if (
    !YEAR_MONTH_RE.test(input.targetYearMonth) ||
    !YEAR_MONTH_RE.test(input.currentYearMonth)
  ) {
    return { write: false, reason: 'invalid_month' };
  }
  if (input.targetYearMonth !== input.currentYearMonth) {
    return { write: false, reason: 'not_current_month' };
  }
  if (input.periodStatus === 'closed') {
    return { write: false, reason: 'closed_period' };
  }
  return { write: true, yearMonth: input.targetYearMonth };
}

function persistablePercent(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!/^-?\d{1,4}(\.\d{1,4})?$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Copy contract, cost, and margin fields off an existing compose result.
 * `include_general` uses the full pair compose already used for profit.
 * Direct and both keep the direct pair. Profit amounts are copied, not recomputed.
 * Returns null when there is no contract value to store.
 */
export function marginSnapshotFromComposed(
  source: ComposedMarginSource,
): MarginSnapshotAmounts | null {
  if (!source.commercial) return null;
  const currency = source.currency.trim().toUpperCase();
  if (currency.length !== 3) return null;

  const useFull = source.projectProfitabilityMode === 'include_general';
  const actualCost = useFull
    ? source.cost.fullActualCostToDate
    : source.cost.directActualCostToDate;
  const forecastCost = useFull
    ? source.cost.fullForecastFinalCost
    : source.cost.directForecastFinalCost;

  return {
    currency,
    contractValue: source.commercial.currentContractValue.amount,
    actualCost: actualCost.amount,
    forecastCost: forecastCost.amount,
    actualMargin: source.profit?.actualProfit.amount ?? null,
    forecastMargin: source.profit?.estimatedProfit.amount ?? null,
    actualMarginPercent: persistablePercent(source.profit?.actualMarginPercent),
    forecastMarginPercent: persistablePercent(source.profit?.marginPercent),
  };
}
