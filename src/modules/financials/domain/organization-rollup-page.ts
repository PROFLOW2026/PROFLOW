import type { ProjectRollupRow } from '../application/get-organization-project-rollup';
import type { MoneyValue } from '@/shared/money';
import {
  aggregateOrgCash,
  aggregateOrgCommercial,
  aggregateOrgCost,
  aggregateOrgProfit,
  deriveRecognizedCompanyRevenue,
  type OrgCashTotals,
  type OrgCommercialTotals,
  type OrgCostTotals,
  type OrgProfitTotals,
} from './aggregate-org-report';

/**
 * Display window for organization project rows.
 * `from` / `to` are 1-based and inclusive. Both are 0 when the page is empty.
 */
export interface OrganizationRollupShowing {
  readonly from: number;
  readonly to: number;
  readonly total: number;
}

export interface OrganizationRollupTotals {
  readonly commercial: OrgCommercialTotals;
  readonly cash: OrgCashTotals;
  readonly cost: OrgCostTotals;
  readonly profit: OrgProfitTotals;
  readonly recognizedCompanyRevenue: MoneyValue | null;
}

/**
 * Page only the rows that will be displayed.
 * A missing or non-positive limit means the full list — never a hidden cap.
 */
export function pageOrganizationRollupRows<T>(
  rows: readonly T[],
  offset = 0,
  limit?: number,
): readonly T[] {
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.trunc(offset) : 0;
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return rows;
  return rows.slice(safeOffset, safeOffset + Math.trunc(limit));
}

export function organizationRollupShowing(
  total: number,
  offset: number,
  pageLength: number,
): OrganizationRollupShowing {
  const safeTotal = Math.max(0, total);
  if (safeTotal === 0 || pageLength <= 0) {
    return { from: 0, to: 0, total: safeTotal };
  }
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.trunc(offset) : 0;
  return {
    from: safeOffset + 1,
    to: safeOffset + pageLength,
    total: safeTotal,
  };
}

/**
 * Organization totals, profit, allocations, and balances use every eligible row.
 * `rows` is only the display page. Formulas stay the existing org aggregates.
 */
export function presentOrganizationRollup(
  eligibleRows: readonly ProjectRollupRow[],
  options: {
    readonly currency: string;
    readonly offset?: number;
    readonly limit?: number;
    readonly canReadCommercial: boolean;
    readonly unallocatedBusinessCosts?: MoneyValue | null;
  },
): {
  readonly eligibleRows: readonly ProjectRollupRow[];
  readonly rows: readonly ProjectRollupRow[];
  readonly showing: OrganizationRollupShowing;
  readonly totals: OrganizationRollupTotals;
} {
  const offset = options.offset ?? 0;
  const rows = pageOrganizationRollupRows(eligibleRows, offset, options.limit);
  return {
    eligibleRows,
    rows,
    showing: organizationRollupShowing(eligibleRows.length, offset, rows.length),
    totals: {
      commercial: aggregateOrgCommercial(eligibleRows, options.currency),
      cash: aggregateOrgCash(eligibleRows, options.currency),
      cost: aggregateOrgCost(eligibleRows, options.currency, {
        unallocatedBusinessCosts: options.unallocatedBusinessCosts,
      }),
      profit: aggregateOrgProfit(eligibleRows, options.currency),
      recognizedCompanyRevenue: deriveRecognizedCompanyRevenue(
        eligibleRows,
        options.currency,
        options.canReadCommercial,
      ),
    },
  };
}
