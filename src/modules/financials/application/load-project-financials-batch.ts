import { buildSliceAvailability, resolveProjectFinancialKpiAvailability } from '../domain/financial-slice-availability';
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
import { sumSubcontractRemainingCommitmentForProject } from '../data/subcontract-commitment.repository';
import { mergeProjectRemainingCommitments } from '../domain/merge-commitments';
import { loadExpenseContributionsForProjects } from '../data/expenses.repository';
import { loadMonthCloseEconomicForProjects } from '../data/month-close-economic.repository';
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
 * Same compose path as getProjectFinancials - O(1) query groups vs O(N) per project.
 * Permission-denied slices stay null / unavailable — never silent empty arrays as Actual zero (N-002).
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
  // Sequential on purpose: batch compose runs inside a single-connection tx.
  const commercialByProject = canReadCommercial
    ? await loadCommercialDataForProjects(context.db, context.organizationId, projectIds)
    : new Map();
  const billingByProject = canReadBilling
    ? await loadBillingRowsGroupedByProject(context.db, context.organizationId, projectIds)
    : new Map<string, ProjectBillingRows>();
  const expenseContributions = canReadExpenses
    ? options.expenseContributions
      ? options.expenseContributions.filter(
          (row) => row.projectId != null && projectIdSet.has(row.projectId),
        )
      : await loadExpenseContributionsForProjects(context.db, context.organizationId, projectIds)
    : null;
  const laborByProject = canReadWorkforce
    ? await sumLaborCostGroupedByProject(
        context.db,
        context.organizationId,
        projectIds,
        currency,
      )
    : new Map();
  const monthlyLaborByProject = monthCostsReady
    ? await sumMonthlyAllocatedLaborByProject(
        context.db,
        context.organizationId,
        projectIds,
        currency,
      )
    : new Map();
  const committedByProject = canReadProcurement
    ? await sumOpenCommittedCostsForProjects(
        context.db,
        context.organizationId,
        projectIds,
        currency,
      )
    : new Map();
  const apByProject = canReadAp
    ? await sumOpenApPayableForProjects(
        context.db,
        context.organizationId,
        projectIds,
        currency,
      )
    : new Map();
  const recognizedByProject = canReadAp
    ? await loadRecognizedVendorBillsForProjects(
        context.db,
        context.organizationId,
        projectIds,
        currency,
      )
    : new Map();
  const monthCloseByProject = await loadMonthCloseEconomicForProjects(
    context.db,
    context.organizationId,
    projectIds,
    currency,
  );

  const subcontractByProject = new Map<
    string,
    Awaited<ReturnType<typeof sumSubcontractRemainingCommitmentForProject>>
  >();
  if (canReadProcurement && canReadAp) {
    for (const projectId of projectIds) {
      subcontractByProject.set(
        projectId,
        await sumSubcontractRemainingCommitmentForProject(
          context.db,
          context.organizationId,
          projectId,
          currency,
        ),
      );
    }
  }

  const expensesByProject = new Map<string, ProjectExpenseContribution[]>();
  if (expenseContributions) {
    for (const line of expenseContributions) {
      if (!line.projectId) continue;
      const list = expensesByProject.get(line.projectId) ?? [];
      list.push(line);
      expensesByProject.set(line.projectId, list);
    }
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
    if (canReadWorkforce && hasWorkforce) {
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

    const poCommitted = canReadProcurement ? (committedByProject.get(projectId) ?? null) : null;
    const subcontractCommitted = canReadProcurement
      ? (subcontractByProject.get(projectId) ?? null)
      : null;
    const mergedCommitted =
      poCommitted || subcontractCommitted
        ? {
            total: mergeProjectRemainingCommitments({
              currency: projectCurrency,
              poCommitted: poCommitted?.total ?? zeroMoney(projectCurrency),
              subcontractRemaining: subcontractCommitted?.total ?? zeroMoney(projectCurrency),
            }),
            excludedForeignCurrencyCount:
              (poCommitted?.excludedForeignCurrencyCount ?? 0) +
              (subcontractCommitted?.excludedForeignCurrencyCount ?? 0),
          }
        : null;

    const projectSliceAvailability = buildSliceAvailability({
      canReadCommercial,
      canReadBilling,
      canReadExpenses,
      canReadWorkforce,
      canReadProcurement,
      canReadAp,
      laborLoaded: laborInput?.hasWorkforceData === true,
    });

    const composed = composeProjectFinancials({
      projectId,
      currency: projectCurrency,
      expectedRemainingCostAmount: meta?.expectedRemainingCostAmount ?? null,
      workKind: meta?.workKind ?? 'project',
      pricingMode: meta?.pricingMode ?? null,
      canReadCommercial,
      canReadBilling,
      canReadProfit,
      canReadExpenses,
      canReadWorkforce,
      canReadProcurement,
      canReadAp,
      commercialData: commercialByProject.get(projectId) ?? null,
      billingRows: billingByProject.get(projectId) ?? null,
      expenseContributions: canReadExpenses ? (expensesByProject.get(projectId) ?? []) : null,
      laborInput,
      committed: mergedCommitted,
      openAp: canReadAp ? (apByProject.get(projectId) ?? null) : null,
      recognizedVendor: canReadAp ? (recognizedByProject.get(projectId) ?? null) : null,
      monthCloseEconomic: monthCloseByProject.get(projectId),
      sliceAvailability: projectSliceAvailability,
    });

    result.set(projectId, {
      ...composed,
      kpiAvailability: resolveProjectFinancialKpiAvailability(composed),
    });
  }

  return result;
}
