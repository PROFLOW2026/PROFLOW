import { sumOrganizationProjectLaborCoverage } from '@/modules/workforce';
import type { CostSourceKey, FinancialCoverage } from '@/modules/financials/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { endOfMonth, startOfMonth, todayInTimeZone } from '@/shared/dates';
import { fromNumericString, isZeroMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { buildFinancialCoverage, mergeCoveragePartials } from '../domain/coverage';
import type { CoveragePartial } from '../domain/types';
import { aggregateProjectCosts } from '../domain/cost-aggregation';
import {
  aggregateOrgCommercial,
  aggregateOrgCost,
  aggregateOrgProfit,
} from '../domain/aggregate-org-report';
import {
  computeUnallocatedOrganizationCosts,
  sumProjectTouchingExpenseNets,
} from '../domain/org-cost-reconciliation';
import {
  computeBillingPositionFromRows,
  countOverdueFromBillingRows,
  hasAnyBillingUsage,
  loadOrganizationBillingRows,
  sumInvoicedInDateRange,
} from '../data/billing.repository';
import {
  countPendingChanges,
  countUnbilledApprovedChanges,
} from '../data/commercial.repository';
import {
  hasAnyExpenseUsage,
  loadOrganizationExpenseContributions,
  sumOrganizationActualCosts,
  sumOrganizationCostsInDateRange,
} from '../data/expenses.repository';
import {
  countActiveProjects,
  hasAnyProject,
  listRecentActiveProjects,
  type ActiveProjectSummary,
} from '../data/projects.repository';
import { getOrganizationProjectRollup } from './get-organization-project-rollup';

export interface DashboardAttention {
  readonly pendingChangesCount: number;
  readonly unbilledApprovedCount: number;
  readonly overdueBillingCount: number;
}

/**
 * Organization forecast reconciliation across all base-currency active projects.
 * Unallocated business costs are disclosed beside project totals — never forced into profit.
 */
export interface OrganizationForecastSummary {
  readonly totalCurrentContract: MoneyValue;
  readonly totalActualProjectCost: MoneyValue;
  readonly totalAllocatedOverhead: MoneyValue;
  readonly totalRemainingCommitments: MoneyValue;
  readonly totalExpectedRemaining: MoneyValue;
  readonly totalForecastFinalCost: MoneyValue;
  readonly totalActualMargin: MoneyValue | null;
  readonly totalForecastMargin: MoneyValue | null;
  /** Finalized org costs awaiting allocation — not in project Actual / profit. */
  readonly unallocatedBusinessCosts: MoneyValue;
  readonly eligibleProjectCount: number;
  readonly excludedForeignCurrencyCount: number;
}

export interface HomeDashboardData {
  readonly isBrandNew: boolean;
  readonly activeProjectCount: number;
  readonly recentProjects: readonly ActiveProjectSummary[];
  readonly totalContractValue: MoneyValue | null;
  readonly contractValueCoverage: FinancialCoverage | null;
  readonly totalActualCost: MoneyValue | null;
  readonly costCoverage: FinancialCoverage | null;
  readonly estimatedProfit: MoneyValue | null;
  readonly profitCoverage: FinancialCoverage | null;
  /** Full org forecast rollup (closes Wave 2 Actual-centric home limitation). */
  readonly forecast: OrganizationForecastSummary | null;
  readonly billing: {
    readonly invoiced: MoneyValue;
    readonly paid: MoneyValue;
    readonly outstanding: MoneyValue;
  } | null;
  readonly billingCoverage: FinancialCoverage | null;
  readonly organizationSummary: {
    readonly outstanding: MoneyValue;
    readonly invoicedThisMonth: MoneyValue;
    readonly costsThisMonth: MoneyValue;
  } | null;
  readonly attention: DashboardAttention;
  readonly showBilling: boolean;
  readonly showProfit: boolean;
  readonly canCreateProject: boolean;
  readonly canCreateExpense: boolean;
}

export interface HomeDashboardOptions {
  /** All | Projects | Jobs for forecast / rollup scope. Default: all. */
  readonly workKindFilter?: string | null;
}

export async function getHomeDashboard(
  context: OrgContext,
  options: HomeDashboardOptions = {},
): Promise<HomeDashboardData> {
  const currency = context.organization.baseCurrency;
  const today = todayInTimeZone(context.organization.timezone);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const canReadFinancials = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canReadProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);
  const canReadContracts = hasPermission(context, PERMISSIONS.CONTRACTS_READ);
  const canCreateProject = hasPermission(context, PERMISSIONS.PROJECTS_CREATE);
  const canCreateExpense = hasPermission(context, PERMISSIONS.EXPENSES_CREATE);

  const [
    hasProjects,
    hasExpenses,
    hasBilling,
    activeProjectCount,
    recentProjects,
    pendingChangesCount,
    unbilledApprovedCount,
  ] = await Promise.all([
    hasAnyProject(context.db, context.organizationId),
    hasAnyExpenseUsage(context.db, context.organizationId),
    hasAnyBillingUsage(context.db, context.organizationId),
    countActiveProjects(context.db, context.organizationId),
    listRecentActiveProjects(context.db, context.organizationId),
    canReadContracts
      ? countPendingChanges(context.db, context.organizationId)
      : Promise.resolve(0),
    canReadContracts
      ? countUnbilledApprovedChanges(context.db, context.organizationId)
      : Promise.resolve(0),
  ]);

  const isBrandNew = !hasProjects && !hasExpenses && !hasBilling;

  if (isBrandNew) {
    return {
      isBrandNew: true,
      activeProjectCount,
      recentProjects,
      totalContractValue: null,
      contractValueCoverage: null,
      totalActualCost: null,
      costCoverage: null,
      estimatedProfit: null,
      profitCoverage: null,
      forecast: null,
      billing: null,
      billingCoverage: null,
      organizationSummary: null,
      attention: {
        pendingChangesCount,
        unbilledApprovedCount,
        overdueBillingCount: 0,
      },
      showBilling: false,
      showProfit: false,
      canCreateProject,
      canCreateExpense,
    };
  }

  const wantForecast = canReadFinancials;
  const wantBilling = canReadBilling && hasBilling;
  const wantMonthInvoiced = canReadFinancials && wantBilling;
  const wantMonthCosts = canReadFinancials && (wantBilling || hasExpenses);

  const [rollup, expenseLayer, billingRows, invoicedThisMonth, costsThisMonth] =
    await Promise.all([
      wantForecast
        ? getOrganizationProjectRollup(context, {
            workKindFilter: options.workKindFilter,
          })
        : Promise.resolve(null),
      wantForecast ? collectOrgExpenseLayer(context, currency) : Promise.resolve(null),
      wantBilling
        ? loadOrganizationBillingRows(context.db, context.organizationId)
        : Promise.resolve(null),
      wantMonthInvoiced
        ? sumInvoicedInDateRange(
            context.db,
            context.organizationId,
            currency,
            monthStart,
            monthEnd,
          )
        : Promise.resolve(null),
      wantMonthCosts
        ? sumOrganizationCostsInDateRange(
            context.db,
            context.organizationId,
            currency,
            monthStart,
            monthEnd,
          )
        : Promise.resolve(null),
    ]);

  // Derive overdue from the billing rows already loaded — avoid a second full org load.
  const overdueBillingCount = billingRows
    ? countOverdueFromBillingRows(billingRows, today)
    : 0;

  const costCoverageBundle = expenseLayer?.coverage ?? null;
  const unallocatedBusinessCosts = expenseLayer?.unallocatedBusinessCosts ?? null;

  let totalContractValue: MoneyValue | null = null;
  let contractValueCoverage: FinancialCoverage | null = null;
  let totalActualCost: MoneyValue | null = null;
  let costCoverage: FinancialCoverage | null = null;
  let profitCoverage: FinancialCoverage | null = null;
  let estimatedProfit: MoneyValue | null = null;
  let forecast: OrganizationForecastSummary | null = null;

  if (rollup) {
    const commercial = rollup.canReadCommercial
      ? aggregateOrgCommercial(rollup.rows, currency)
      : null;
    const cost = aggregateOrgCost(rollup.rows, currency, {
      unallocatedBusinessCosts: unallocatedBusinessCosts ?? zeroMoney(currency),
    });
    const profitability = rollup.canReadProfit
      ? aggregateOrgProfit(rollup.rows, currency)
      : null;

    if (commercial && rollup.totalEligibleProjectCount > 0) {
      totalContractValue = commercial.current.value;
      if (rollup.excludedForeignCurrencyCount > 0) {
        contractValueCoverage = buildFinancialCoverage([], new Date(), [
          {
            reason: 'foreign_currency_contracts_excluded',
            count: rollup.excludedForeignCurrencyCount,
          },
        ]);
      }
    }

    const hasProjectCost =
      rollup.totalEligibleProjectCount > 0 &&
      (costCoverageBundle?.hasCostData ||
        !isZeroMoney(cost.actual.value) ||
        !isZeroMoney(cost.committed.value) ||
        !isZeroMoney(cost.expectedRemaining.value) ||
        !isZeroMoney(cost.estimatedFinal.value));

    if (hasProjectCost || (unallocatedBusinessCosts && !isZeroMoney(unallocatedBusinessCosts))) {
      totalActualCost = cost.actual.value;
      if (costCoverageBundle) {
        const mergedSources = mergeSourcePresence(costCoverageBundle.sources);
        const mergedPartials = mergeCoveragePartials(
          costCoverageBundle.partials,
          contractValueCoverage?.partials ?? [],
        );
        costCoverage = buildFinancialCoverage(mergedSources, new Date(), mergedPartials);
        profitCoverage = costCoverage;
      }

      if (canReadProfit && profitability) {
        estimatedProfit = profitability.estimatedProfit.value;
      }
    }

    forecast = {
      totalCurrentContract: commercial?.current.value ?? zeroMoney(currency),
      totalActualProjectCost: cost.actual.value,
      totalAllocatedOverhead: cost.overhead.value,
      totalRemainingCommitments: cost.committed.value,
      totalExpectedRemaining: cost.expectedRemaining.value,
      totalForecastFinalCost: cost.estimatedFinal.value,
      totalActualMargin: canReadProfit ? (profitability?.actualProfit.value ?? null) : null,
      totalForecastMargin: canReadProfit ? (profitability?.estimatedProfit.value ?? null) : null,
      unallocatedBusinessCosts: unallocatedBusinessCosts ?? zeroMoney(currency),
      eligibleProjectCount: rollup.totalEligibleProjectCount,
      excludedForeignCurrencyCount: rollup.excludedForeignCurrencyCount,
    };
  }

  let billing: HomeDashboardData['billing'] = null;
  let billingCoverage: FinancialCoverage | null = null;
  let organizationSummary: HomeDashboardData['organizationSummary'] = null;

  if (billingRows) {
    const position = computeBillingPositionFromRows(billingRows, currency);
    billing = {
      invoiced: position.invoiced,
      paid: position.paid,
      outstanding: position.outstanding,
    };
    if (position.excludedForeignCurrencyRecordCount > 0) {
      billingCoverage = buildFinancialCoverage([], new Date(), [
        {
          reason: 'foreign_currency_billing_excluded',
          count: position.excludedForeignCurrencyRecordCount,
        },
      ]);
    }

    if (canReadFinancials && invoicedThisMonth && costsThisMonth) {
      organizationSummary = {
        outstanding: position.outstanding,
        invoicedThisMonth,
        costsThisMonth,
      };
    }
  } else if (canReadFinancials && hasExpenses && costsThisMonth) {
    organizationSummary = {
      outstanding: zeroMoney(currency),
      invoicedThisMonth: zeroMoney(currency),
      costsThisMonth,
    };
  }

  return {
    isBrandNew,
    activeProjectCount,
    recentProjects,
    totalContractValue,
    contractValueCoverage,
    totalActualCost,
    costCoverage,
    estimatedProfit,
    profitCoverage,
    forecast,
    billing,
    billingCoverage,
    organizationSummary,
    attention: {
      pendingChangesCount,
      unbilledApprovedCount,
      overdueBillingCount,
    },
    showBilling: hasBilling && canReadBilling,
    showProfit: canReadProfit && estimatedProfit !== null,
    canCreateProject,
    canCreateExpense,
  };
}

/**
 * Expense-layer coverage + unallocated org costs in one pass.
 * Unallocated = org finalized expense NET − project-touching expense NET.
 */
async function collectOrgExpenseLayer(
  context: OrgContext,
  currency: string,
): Promise<{
  coverage: {
    sources: { source: CostSourceKey; hasData: boolean }[];
    partials: CoveragePartial[];
    hasCostData: boolean;
  };
  unallocatedBusinessCosts: MoneyValue;
}> {
  const canReadWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);
  const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);

  const [contributions, laborAgg, orgExpense] = await Promise.all([
    canReadExpenses
      ? loadOrganizationExpenseContributions(context.db, context.organizationId)
      : Promise.resolve([]),
    canReadWorkforce
      ? sumOrganizationProjectLaborCoverage(context.db, context.organizationId, currency)
      : Promise.resolve(null),
    canReadExpenses
      ? sumOrganizationActualCosts(context.db, context.organizationId, currency)
      : Promise.resolve({ total: zeroMoney(currency), hasExpenseData: false }),
  ]);

  const projectTouching = sumProjectTouchingExpenseNets(contributions, currency);
  const unallocatedBusinessCosts = computeUnallocatedOrganizationCosts({
    orgFinalizedExpenseTotal: orgExpense.total,
    projectTouchingExpenseTotal: projectTouching,
  });

  let labor = null;
  if (laborAgg && laborAgg.entryCount > 0) {
    labor = {
      laborCost:
        fromNumericString(laborAgg.totalAmount ?? '0', laborAgg.currency) ?? zeroMoney(currency),
      hasWorkforceData: true,
      entriesMissingCost: laborAgg.entriesMissingCost,
      excludedForeignCurrencyEntries: laborAgg.excludedForeignCurrencyEntries,
      projectIdsWithWorkforceLabor: new Set(laborAgg.projectIdsWithLabor),
    };
  }

  if (contributions.length === 0 && !labor?.hasWorkforceData) {
    return {
      coverage: { sources: [], partials: [], hasCostData: false },
      unallocatedBusinessCosts,
    };
  }

  const aggregated = aggregateProjectCosts(contributions, labor, currency);
  return {
    coverage: {
      sources: [...aggregated.sources],
      partials: [...aggregated.partials],
      hasCostData: true,
    },
    unallocatedBusinessCosts,
  };
}

function mergeSourcePresence(
  sources: readonly { source: CostSourceKey; hasData: boolean }[],
): { source: CostSourceKey; hasData: boolean }[] {
  const map = new Map<string, boolean>();
  for (const item of sources) {
    map.set(item.source, (map.get(item.source) ?? false) || item.hasData);
  }

  return (
    [
      'direct_expenses',
      'workforce',
      'allocated_overhead',
      'shared_costs',
      'subcontractor',
    ] as const
  ).map((source) => ({
    source,
    hasData: map.get(source) ?? false,
  }));
}
