import { sumOrganizationProjectLaborCoverage } from '@/modules/workforce';
import type { CostSourceKey, FinancialCoverage } from '@/modules/financials/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { endOfMonth, startOfMonth, todayInTimeZone } from '@/shared/dates';
import { fromNumericString, zeroMoney, type MoneyValue } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { buildFinancialCoverage, mergeCoveragePartials } from '../domain/coverage';
import type { CoveragePartial } from '../domain/types';
import { aggregateProjectCosts } from '../domain/cost-aggregation';
import { computeProfitPosition, roundProfitPosition } from '../domain/profit';
import {
  computeBillingPositionFromRows,
  countOverdueBillingRecords,
  hasAnyBillingUsage,
  loadOrganizationBillingRows,
  sumInvoicedInDateRange,
} from '../data/billing.repository';
import {
  countPendingChanges,
  countUnbilledApprovedChanges,
  sumActiveProjectContractValues,
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

export interface DashboardAttention {
  readonly pendingChangesCount: number;
  readonly unbilledApprovedCount: number;
  readonly overdueBillingCount: number;
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

export async function getHomeDashboard(context: OrgContext): Promise<HomeDashboardData> {
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

  // Wave 1: independent existence + list + attention counts (was a long sequential chain).
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

  // Wave 2: all remaining aggregates in one pipelined round (flags known from wave 1).
  const wantContracts = canReadContracts && canReadFinancials;
  const wantCosts = canReadFinancials && hasExpenses;
  const wantBilling = canReadBilling && hasBilling;
  const wantMonthInvoiced = canReadFinancials && wantBilling;
  const wantMonthCosts = canReadFinancials && (wantBilling || hasExpenses);

  const [
    contractSum,
    orgCosts,
    costAggregation,
    billingRows,
    overdueBillingCount,
    invoicedThisMonth,
    costsThisMonth,
  ] = await Promise.all([
    wantContracts
      ? sumActiveProjectContractValues(context.db, context.organizationId, currency)
      : Promise.resolve(null),
    wantCosts
      ? sumOrganizationActualCosts(context.db, context.organizationId, currency)
      : Promise.resolve(null),
    wantCosts ? collectOrgCostSources(context, currency) : Promise.resolve(null),
    wantBilling
      ? loadOrganizationBillingRows(context.db, context.organizationId)
      : Promise.resolve(null),
    wantBilling
      ? countOverdueBillingRecords(context.db, context.organizationId, today)
      : Promise.resolve(0),
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

  let totalContractValue: MoneyValue | null = null;
  let contractValueCoverage: FinancialCoverage | null = null;
  if (contractSum && contractSum.activeCount > 0) {
    totalContractValue = fromNumericString(contractSum.total, currency) ?? zeroMoney(currency);
    if (contractSum.excludedForeignCurrencyProjectCount > 0) {
      contractValueCoverage = buildFinancialCoverage([], new Date(), [
        {
          reason: 'foreign_currency_contracts_excluded',
          count: contractSum.excludedForeignCurrencyProjectCount,
        },
      ]);
    }
  }

  let totalActualCost: MoneyValue | null = null;
  let costCoverage: FinancialCoverage | null = null;
  let profitCoverage: FinancialCoverage | null = null;
  let estimatedProfit: MoneyValue | null = null;

  if (orgCosts && costAggregation) {
    totalActualCost = orgCosts.total;
    const mergedSources = mergeSourcePresence(costAggregation.sources);
    const mergedPartials = mergeCoveragePartials(
      costAggregation.partials,
      contractValueCoverage?.partials ?? [],
    );
    costCoverage = buildFinancialCoverage(mergedSources, new Date(), mergedPartials);
    profitCoverage = costCoverage;

    if (canReadProfit && totalContractValue) {
      estimatedProfit = roundProfitPosition(
        computeProfitPosition(totalContractValue, orgCosts.total),
      ).estimatedProfit;
    }
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
 * Coverage sources for the home dashboard: expense contributions + optional labor.
 * Avoids per-active-project N+1 that previously scaled with project count.
 */
async function collectOrgCostSources(
  context: OrgContext,
  currency: string,
): Promise<{
  sources: { source: CostSourceKey; hasData: boolean }[];
  partials: CoveragePartial[];
}> {
  const canReadWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);

  const [contributions, laborAgg] = await Promise.all([
    loadOrganizationExpenseContributions(context.db, context.organizationId),
    canReadWorkforce
      ? sumOrganizationProjectLaborCoverage(context.db, context.organizationId, currency)
      : Promise.resolve(null),
  ]);

  let labor = null;
  if (laborAgg && laborAgg.entryCount > 0) {
    labor = {
      laborCost:
        fromNumericString(laborAgg.totalAmount ?? '0', laborAgg.currency) ?? zeroMoney(currency),
      hasWorkforceData: true,
      entriesMissingCost: laborAgg.entriesMissingCost,
      excludedForeignCurrencyEntries: laborAgg.excludedForeignCurrencyEntries,
    };
  }

  if (contributions.length === 0 && !labor?.hasWorkforceData) {
    return { sources: [], partials: [] };
  }

  const aggregated = aggregateProjectCosts(contributions, labor, currency);
  return { sources: [...aggregated.sources], partials: [...aggregated.partials] };
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
