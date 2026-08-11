import { and, eq, isNull } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import type { MoneyValue } from '@/shared/money';
import { compareMoney, zeroMoney } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { filterRowsByWorkKind } from '../domain/work-kind-filter';
import {
  normalizePricingMode,
  normalizeWorkKind,
  parseWorkKindFilter,
  type PricingMode,
  type WorkKind,
  type WorkKindFilter,
} from '../domain/work-pricing';
import type { ProjectExpenseContribution } from '../domain/cost-aggregation';
import {
  mergeDataConfidence,
  type DataConfidence,
} from '../domain/data-confidence';
import {
  loadProjectFinancialsBatch,
  type ProjectForecastMeta,
} from './load-project-financials-batch';

export interface ProjectRollupRow {
  readonly projectId: string;
  readonly name: string;
  readonly status: string;
  readonly workKind: WorkKind;
  readonly pricingMode: PricingMode;
  /** Open-price job — costs in rollup; profit fields stay null. */
  readonly priceNotSet: boolean;
  readonly currency: string;
  readonly originalContract: MoneyValue | null;
  readonly approvedAdditions: MoneyValue | null;
  readonly approvedReductions: MoneyValue | null;
  readonly currentContract: MoneyValue | null;
  readonly pendingChanges: MoneyValue | null;
  readonly invoiced: MoneyValue | null;
  readonly paid: MoneyValue | null;
  readonly outstanding: MoneyValue | null;
  readonly actualCost: MoneyValue | null;
  readonly laborActual: MoneyValue | null;
  readonly vendorActual: MoneyValue | null;
  readonly overheadActual: MoneyValue | null;
  readonly committedOpen: MoneyValue | null;
  readonly openApPayable: MoneyValue | null;
  readonly expectedRemainingCost: MoneyValue | null;
  readonly estimatedFinalCost: MoneyValue | null;
  readonly assetCapitalActual: MoneyValue | null;
  readonly estimatedProfit: MoneyValue | null;
  readonly marginPercent: string | null;
  readonly actualProfit: MoneyValue | null;
  readonly actualMarginPercent: string | null;
  readonly progressPercent: string | null;
  readonly profitable: boolean | null;
}

export interface OrganizationOpsSummary {
  readonly activeProjectCount: number;
  readonly averageProgressPercent: string | null;
  readonly lossMakingCount: number | null;
  readonly profitableCount: number | null;
}

export interface OrganizationProjectRollupOptions {
  /**
   * Optional row pagination for UI tables.
   * Financial totals / ops always use the full eligible set — never truncated.
   */
  readonly limit?: number;
  readonly offset?: number;
  /**
   * All | Projects | Jobs. Defaults to all (projects + jobs, no double count).
   * Unallocated org costs are reported beside rollup — not affected by this filter.
   */
  readonly workKindFilter?: WorkKindFilter | string | null;
  /**
   * Request-scoped reuse of org expense contributions (dashboard single-load).
   * When set, batch financials skip a second expense query.
   */
  readonly expenseContributions?: readonly ProjectExpenseContribution[];
}

export interface OrganizationProjectRollup {
  readonly currency: string;
  readonly workKindFilter: WorkKindFilter;
  readonly rows: readonly ProjectRollupRow[];
  readonly ops: OrganizationOpsSummary;
  /** Projects excluded because their currency differs from org base. */
  readonly excludedForeignCurrencyCount: number;
  /**
   * @deprecated Always 0 — Wave 2 removed the 50-project correctness cap.
   * Kept for UI compatibility; prefer totalEligibleProjectCount.
   */
  readonly truncatedActiveProjectCount: number;
  /** Base-currency active projects/jobs included in financial totals (before row pagination). */
  readonly totalEligibleProjectCount: number;
  readonly note: string;
  readonly canReadProfit: boolean;
  readonly canReadBilling: boolean;
  readonly canReadCommercial: boolean;
  /**
   * Worst-of project DATA CONFIDENCE across eligible rows (FX exclusions included).
   * Unallocated org remainder is applied by callers that know the expense layer.
   */
  readonly dataConfidence: {
    readonly level: 'high' | 'medium' | 'needs_data';
    readonly reasons: readonly string[];
  };
}


/**
 * Org-level project/job comparison for reporting (docs 29, 46).
 * Never mixes currencies. Profit only when PROJECT_PROFIT_READ is held.
 * Does not label anything as Revenue. VAT is not profit.
 * Actual / Committed / Forecast stay separate on cost fields.
 *
 * All base-currency active projects and jobs are included (filterable).
 * Optional limit/offset only pages the returned `rows` array.
 *
 * Uses set-based batch loads (not per-project getProjectFinancials) while
 * composing each row with the same financial formulas.
 */
export async function getOrganizationProjectRollup(
  context: OrgContext,
  options: OrganizationProjectRollupOptions = {},
): Promise<OrganizationProjectRollup> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);

  const currency = context.organization.baseCurrency;
  const canProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);
  const canBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canCommercial = hasPermission(context, PERMISSIONS.CONTRACTS_READ);
  const workKindFilter = parseWorkKindFilter(options.workKindFilter);

  // One active-projects scan (was listActiveProjectIds + all non-archived rows).
  const projectRows = await context.db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      currency: projects.currency,
      progressPercent: projects.progressPercent,
      expectedRemainingCostAmount: projects.expectedRemainingCostAmount,
      workKind: projects.workKind,
      pricingMode: projects.pricingMode,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, context.organizationId),
        eq(projects.status, 'active'),
        isNull(projects.archivedAt),
      ),
    );

  const byId = new Map(projectRows.map((row) => [row.id, row]));
  let excludedForeignCurrencyCount = 0;
  let progressSum = 0;
  let progressCount = 0;

  const eligibleIds: string[] = [];
  const forecastByProject = new Map<string, ProjectForecastMeta>();
  for (const meta of projectRows) {
    const projectCurrency = (meta.currency ?? currency).toUpperCase();
    if (projectCurrency !== currency.toUpperCase()) {
      excludedForeignCurrencyCount += 1;
      continue;
    }
    eligibleIds.push(meta.id);
    forecastByProject.set(meta.id, {
      currency: projectCurrency,
      expectedRemainingCostAmount: meta.expectedRemainingCostAmount,
      workKind: meta.workKind,
      pricingMode: meta.pricingMode,
    });
  }

  const financialsByProject = await loadProjectFinancialsBatch(
    context,
    eligibleIds,
    forecastByProject,
    { expenseContributions: options.expenseContributions },
  );

  const builtRows: ProjectRollupRow[] = [];
  for (const projectId of eligibleIds) {
    const meta = byId.get(projectId)!;
    const projectCurrency = (meta.currency ?? currency).toUpperCase();
    const financials = financialsByProject.get(projectId);
    if (!financials) continue;

    const workKind = normalizeWorkKind(financials.workKind ?? meta.workKind);
    const pricingMode = normalizePricingMode(
      financials.pricingMode ?? meta.pricingMode ?? null,
    );
    const priceNotSet = financials.priceNotSet;

    const originalContract = canCommercial
      ? (financials.commercial?.originalContractValue ?? null)
      : null;
    const approvedAdditions = canCommercial
      ? (financials.commercial?.approvedAdditions ?? null)
      : null;
    const approvedReductions = canCommercial
      ? (financials.commercial?.approvedReductions ?? null)
      : null;
    // Open-price: do not surface a fake zero contract as revenue basis.
    const currentContract =
      canCommercial && !priceNotSet
        ? (financials.commercial?.currentContractValue ?? null)
        : null;
    const pendingChanges = canCommercial
      ? (financials.commercial?.pendingChanges ?? null)
      : null;
    const invoiced = canBilling ? financials.billing.invoiced : null;
    const paid = canBilling ? financials.billing.paid : null;
    const outstanding = canBilling ? financials.billing.outstanding : null;
    const actualCost = financials.cost.actualCostToDate;
    const laborActual = financials.cost.laborActual;
    const vendorActual = financials.cost.vendorActual;
    const overheadActual = financials.cost.overheadActual;
    const committedOpen = financials.cost.committedOpen;
    const openApPayable = financials.cost.openApPayable;
    const expectedRemainingCost = financials.cost.expectedRemainingCost;
    const estimatedFinalCost = financials.cost.estimatedFinalCost;
    const assetCapitalActual = financials.cost.byFamily.assetCapital;
    // Open-price rows keep null profit — never count as loss-making.
    const estimatedProfit =
      canProfit && !priceNotSet ? (financials.profit?.estimatedProfit ?? null) : null;
    const marginPercent =
      canProfit && !priceNotSet ? (financials.profit?.marginPercent ?? null) : null;
    const actualProfit =
      canProfit && !priceNotSet ? (financials.profit?.actualProfit ?? null) : null;
    const actualMarginPercent =
      canProfit && !priceNotSet ? (financials.profit?.actualMarginPercent ?? null) : null;
    const profitable =
      estimatedProfit == null
        ? null
        : compareMoney(estimatedProfit, zeroMoney(currency)) > 0
          ? true
          : compareMoney(estimatedProfit, zeroMoney(currency)) < 0
            ? false
            : null;

    builtRows.push({
      projectId,
      name: meta.name,
      status: meta.status,
      workKind,
      pricingMode,
      priceNotSet,
      currency: projectCurrency,
      originalContract: priceNotSet ? null : originalContract,
      approvedAdditions: priceNotSet ? null : approvedAdditions,
      approvedReductions: priceNotSet ? null : approvedReductions,
      currentContract,
      pendingChanges: priceNotSet ? null : pendingChanges,
      invoiced,
      paid,
      outstanding,
      actualCost: actualCost ?? zeroMoney(currency),
      laborActual,
      vendorActual,
      overheadActual,
      committedOpen,
      openApPayable,
      expectedRemainingCost,
      estimatedFinalCost,
      assetCapitalActual,
      estimatedProfit,
      marginPercent,
      actualProfit,
      actualMarginPercent,
      progressPercent: meta.progressPercent,
      profitable,
    });
  }

  const allRows = filterRowsByWorkKind(builtRows, workKindFilter);

  const projectConfidences: DataConfidence[] = [];
  for (const projectId of eligibleIds) {
    const financials = financialsByProject.get(projectId);
    if (!financials?.dataConfidence) continue;
    projectConfidences.push({
      level: financials.dataConfidence.level,
      reasons: financials.dataConfidence.reasons as DataConfidence['reasons'],
    });
  }
  if (excludedForeignCurrencyCount > 0) {
    projectConfidences.push({
      level: 'medium',
      reasons: ['foreign_currency_excluded'],
    });
  }
  const dataConfidence = mergeDataConfidence(projectConfidences);

  for (const row of allRows) {
    if (row.progressPercent != null && row.progressPercent !== '') {
      const parsed = Number(row.progressPercent);
      if (Number.isFinite(parsed)) {
        progressSum += parsed;
        progressCount += 1;
      }
    }
  }

  allRows.sort((a, b) => {
    if (canProfit && a.profitable !== b.profitable) {
      if (a.profitable === false) return -1;
      if (b.profitable === false) return 1;
    }
    return a.name.localeCompare(b.name);
  });

  const lossMakingCount = canProfit
    ? allRows.filter((row) => row.profitable === false).length
    : null;
  const profitableCount = canProfit
    ? allRows.filter((row) => row.profitable === true).length
    : null;

  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit != null && options.limit > 0 ? options.limit : undefined;
  const rows = limit == null ? allRows : allRows.slice(offset, offset + limit);

  return {
    currency,
    workKindFilter,
    rows,
    ops: {
      /** Full base-currency eligible set for the active work-kind filter. */
      activeProjectCount: allRows.length,
      averageProgressPercent:
        progressCount > 0 ? (progressSum / progressCount).toFixed(1) : null,
      lossMakingCount,
      profitableCount,
    },
    excludedForeignCurrencyCount,
    truncatedActiveProjectCount: 0,
    totalEligibleProjectCount: allRows.length,
    note: 'Amounts use organization base currency only. VAT is not treated as profit. Actual, Committed and Forecast stay labelled separately. Incomplete cost coverage is disclosed per project financials. Org totals include every base-currency active project and job in the selected All/Projects/Jobs filter (limit/offset page rows only). Open-price jobs contribute costs but not profit. Unallocated organization costs are reported beside rollup totals, never inside project profit.',
    canReadProfit: canProfit,
    canReadBilling: canBilling,
    canReadCommercial: canCommercial,
    dataConfidence,
  };
}
