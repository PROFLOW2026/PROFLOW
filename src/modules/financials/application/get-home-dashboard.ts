import { getProjectLaborCost } from '@/modules/workforce/application/project-labor-cost';
import type { CostSourceKey, FinancialCoverage } from '@/modules/financials/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
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
  loadProjectExpenseContributions,
  sumOrganizationActualCosts,
  sumOrganizationCostsInDateRange,
} from '../data/expenses.repository';
import {
  countActiveProjects,
  hasAnyProject,
  listActiveProjectIds,
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

  const hasProjects = await hasAnyProject(context.db, context.organizationId);
  const hasExpenses = await hasAnyExpenseUsage(context.db, context.organizationId);
  const hasBilling = await hasAnyBillingUsage(context.db, context.organizationId);

  const isBrandNew = !hasProjects && !hasExpenses && !hasBilling;

  const canReadFinancials = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canReadProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);
  const canReadContracts = hasPermission(context, PERMISSIONS.CONTRACTS_READ);

  const activeProjectCount = await countActiveProjects(context.db, context.organizationId);
  const recentProjects = await listRecentActiveProjects(context.db, context.organizationId);

  let totalContractValue: MoneyValue | null = null;
  let contractValueCoverage: FinancialCoverage | null = null;
  if (canReadContracts && canReadFinancials) {
    const contractSum = await sumActiveProjectContractValues(
      context.db,
      context.organizationId,
      currency,
    );
    if (contractSum.activeCount > 0) {
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
  }

  let totalActualCost: MoneyValue | null = null;
  let costCoverage: FinancialCoverage | null = null;
  let profitCoverage: FinancialCoverage | null = null;
  let estimatedProfit: MoneyValue | null = null;

  if (canReadFinancials && hasExpenses) {
    const orgCosts = await sumOrganizationActualCosts(context.db, context.organizationId, currency);
    totalActualCost = orgCosts.total;

    const activeProjectIds = await listActiveProjectIds(context.db, context.organizationId);
    const costAggregation = await collectOrgCostSources(context, activeProjectIds, currency);
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

  if (canReadBilling && hasBilling) {
    const billingRows = await loadOrganizationBillingRows(context.db, context.organizationId);
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

    if (canReadFinancials) {
      organizationSummary = {
        outstanding: position.outstanding,
        invoicedThisMonth: await sumInvoicedInDateRange(
          context.db,
          context.organizationId,
          currency,
          monthStart,
          monthEnd,
        ),
        costsThisMonth: await sumOrganizationCostsInDateRange(
          context.db,
          context.organizationId,
          currency,
          monthStart,
          monthEnd,
        ),
      };
    }
  } else if (canReadFinancials && hasExpenses) {
    organizationSummary = {
      outstanding: zeroMoney(currency),
      invoicedThisMonth: zeroMoney(currency),
      costsThisMonth: await sumOrganizationCostsInDateRange(
        context.db,
        context.organizationId,
        currency,
        monthStart,
        monthEnd,
      ),
    };
  }

  const attention: DashboardAttention = {
    pendingChangesCount: canReadContracts
      ? await countPendingChanges(context.db, context.organizationId)
      : 0,
    unbilledApprovedCount: canReadContracts
      ? await countUnbilledApprovedChanges(context.db, context.organizationId)
      : 0,
    overdueBillingCount:
      canReadBilling && hasBilling
        ? await countOverdueBillingRecords(context.db, context.organizationId, today)
        : 0,
  };

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
    attention,
    showBilling: hasBilling && canReadBilling,
    showProfit: canReadProfit && estimatedProfit !== null,
    canCreateProject: hasPermission(context, PERMISSIONS.PROJECTS_CREATE),
    canCreateExpense: hasPermission(context, PERMISSIONS.EXPENSES_CREATE),
  };
}

async function collectOrgCostSources(
  context: OrgContext,
  projectIds: readonly string[],
  currency: string,
): Promise<{
  sources: { source: CostSourceKey; hasData: boolean }[];
  partials: CoveragePartial[];
}> {
  const allSources: { source: CostSourceKey; hasData: boolean }[] = [];
  const allPartials: CoveragePartial[] = [];

  for (const projectId of projectIds) {
    const contributions = await loadProjectExpenseContributions(
      context.db,
      context.organizationId,
      projectId,
    );

    let labor = null;
    if (hasPermission(context, PERMISSIONS.WORKFORCE_READ)) {
      try {
        const laborCost = await getProjectLaborCost(context, projectId);
        labor = {
          laborCost: laborCost.laborCost,
          hasWorkforceData: laborCost.hasWorkforceData,
          entriesMissingCost: laborCost.entriesMissingCost,
          excludedForeignCurrencyEntries: laborCost.excludedForeignCurrencyEntries,
        };
      } catch (error) {
        if (error instanceof NotFoundError) {
          labor = null;
        } else {
          throw error;
        }
      }
    }

    if (contributions.length > 0 || labor?.hasWorkforceData) {
      const aggregated = aggregateProjectCosts(contributions, labor, currency);
      allSources.push(...aggregated.sources);
      allPartials.push(...aggregated.partials);
    }
  }

  return { sources: allSources, partials: allPartials };
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
