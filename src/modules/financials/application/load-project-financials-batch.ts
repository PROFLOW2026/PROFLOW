import { fromNumericString, zeroMoney } from '@/shared/money';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  areEmployeeMonthCostsAvailable,
  hasWorkforceLaborData,
  mergeResidualTimeAndMonthlyAllocatedLabor,
  sumLaborCostGroupedByProject,
  sumMonthlyAllocatedLaborByProject,
} from '@/modules/workforce';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import {
  loadBillingRowsGroupedByProject,
  type ProjectBillingRows,
} from '../data/billing.repository';
import { loadCommercialDataForProjects } from '../data/commercial.repository';
import {
  loadRecognizedVendorBillsForProjects,
  sumOpenApPayableForProjects,
  sumOpenCommittedCostsForProjects,
} from '../data/committed-costs.repository';
import { loadExpenseContributionsForProjects } from '../data/expenses.repository';
import type { ProjectExpenseContribution } from '../domain/cost-aggregation';
import { composeProjectFinancials } from './compose-project-financials';

export interface ProjectForecastMeta {
  readonly currency: string;
  readonly expectedRemainingCostAmount: string | null;
  readonly workKind?: string | null;
  readonly pricingMode?: string | null;
}

/**
 * Set-based project financials for org rollup / reports.
 * Same compose path as getProjectFinancials — O(1) query groups vs O(N) per project.
 */
export async function loadProjectFinancialsBatch(
  context: OrgContext,
  projectIds: readonly string[],
  forecastByProject: ReadonlyMap<string, ProjectForecastMeta>,
  options: {
    /**
     * When provided, skip `loadExpenseContributionsForProjects` and reuse this
     * request-scoped result (filtered to `projectIds`). Dashboard uses one
     * authoritative org expense load for rollup + unallocated layer.
     */
    readonly expenseContributions?: readonly ProjectExpenseContribution[];
  } = {},
): Promise<Map<string, ProjectFinancials>> {
  const result = new Map<string, ProjectFinancials>();
  if (projectIds.length === 0) return result;

  const currency = context.organization.baseCurrency.toUpperCase();
  const canReadCommercial = hasPermission(context, PERMISSIONS.CONTRACTS_READ);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canReadProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);
  const canReadProcurement = hasPermission(context, PERMISSIONS.PROCUREMENT_READ);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
  const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);
  const canReadWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);
  const monthCostsReady = canReadWorkforce && areEmployeeMonthCostsAvailable();

  const projectIdSet = new Set(projectIds);
  const [
    commercialByProject,
    billingByProject,
    expenseContributions,
    laborByProject,
    monthlyLaborByProject,
    committedByProject,
    apByProject,
    recognizedByProject,
  ] = await Promise.all([
    canReadCommercial
      ? loadCommercialDataForProjects(context.db, context.organizationId, projectIds)
      : Promise.resolve(new Map()),
    canReadBilling
      ? loadBillingRowsGroupedByProject(context.db, context.organizationId, projectIds)
      : Promise.resolve(new Map<string, ProjectBillingRows>()),
    canReadExpenses
      ? options.expenseContributions
        ? Promise.resolve(
            options.expenseContributions.filter(
              (row) => row.projectId != null && projectIdSet.has(row.projectId),
            ),
          )
        : loadExpenseContributionsForProjects(context.db, context.organizationId, projectIds)
      : Promise.resolve([]),
    canReadWorkforce
      ? sumLaborCostGroupedByProject(
          context.db,
          context.organizationId,
          projectIds,
          currency,
        )
      : Promise.resolve(new Map()),
    monthCostsReady
      ? sumMonthlyAllocatedLaborByProject(
          context.db,
          context.organizationId,
          projectIds,
          currency,
        )
      : Promise.resolve(new Map()),
    canReadProcurement
      ? sumOpenCommittedCostsForProjects(
          context.db,
          context.organizationId,
          projectIds,
          currency,
        )
      : Promise.resolve(new Map()),
    canReadAp
      ? sumOpenApPayableForProjects(
          context.db,
          context.organizationId,
          projectIds,
          currency,
        )
      : Promise.resolve(new Map()),
    canReadAp
      ? loadRecognizedVendorBillsForProjects(
          context.db,
          context.organizationId,
          projectIds,
          currency,
        )
      : Promise.resolve(new Map()),
  ]);

  const expensesByProject = new Map<string, ProjectExpenseContribution[]>();
  for (const line of expenseContributions) {
    if (!line.projectId) continue;
    const list = expensesByProject.get(line.projectId) ?? [];
    list.push(line);
    expensesByProject.set(line.projectId, list);
  }

  for (const projectId of projectIds) {
    const meta = forecastByProject.get(projectId);
    const projectCurrency = (meta?.currency ?? currency).toUpperCase();
    const laborAgg = laborByProject.get(projectId);
    const monthlyAgg = monthlyLaborByProject.get(projectId);

    const residualTimeLabor =
      fromNumericString(laborAgg?.totalAmount ?? '0', projectCurrency) ??
      zeroMoney(projectCurrency);
    const monthlyAllocatedLabor =
      fromNumericString(monthlyAgg?.totalAmount ?? '0', projectCurrency) ??
      zeroMoney(projectCurrency);
    const residualEntryCount = laborAgg?.entryCount ?? 0;
    const hasWorkforce = hasWorkforceLaborData({
      residualEntryCount,
      monthlyAllocatedLabor,
    });

    let laborInput = null;
    if (hasWorkforce) {
      laborInput = {
        laborCost: mergeResidualTimeAndMonthlyAllocatedLabor({
          residualTimeLabor,
          monthlyAllocatedLabor,
        }),
        hasWorkforceData: true,
        entriesMissingCost: laborAgg?.entriesMissingCost ?? 0,
        excludedForeignCurrencyEntries: laborAgg?.excludedForeignCurrencyEntries ?? 0,
      };
    }

    result.set(
      projectId,
      composeProjectFinancials({
        projectId,
        currency: projectCurrency,
        expectedRemainingCostAmount: meta?.expectedRemainingCostAmount ?? null,
        workKind: meta?.workKind ?? 'project',
        pricingMode: meta?.pricingMode ?? null,
        canReadCommercial,
        canReadBilling,
        canReadProfit,
        commercialData: commercialByProject.get(projectId) ?? null,
        billingRows: billingByProject.get(projectId) ?? null,
        expenseContributions: expensesByProject.get(projectId) ?? [],
        laborInput,
        committed: committedByProject.get(projectId) ?? null,
        openAp: apByProject.get(projectId) ?? null,
        recognizedVendor: recognizedByProject.get(projectId) ?? null,
      }),
    );
  }

  return result;
}
