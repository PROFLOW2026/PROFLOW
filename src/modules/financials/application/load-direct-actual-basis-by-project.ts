/**
 * Batched Direct Actual basis for GCM weighting — same compose math as
 * `loadProjectFinancialsBatch({ directActualBasisOnly })`, without per-project full compose.
 */

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
import { composeVendorCostRecognition } from '@/modules/ap/domain/vendor-cost-recognition';
import { addMoney, fromNumericString, isZeroMoney, roundMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import {
  aggregateProjectCosts,
  withRecognizedVendorBills,
  type ProjectExpenseContribution,
} from '../domain/cost-aggregation';
import { applyLinkedExpenseDeductionsToContributions } from '../domain/expense-ap-dedup';
import { loadRecognizedVendorBillsForProjects } from '../data/committed-costs.repository';
import {
  loadCachedOrganizationExpenseContributions,
  loadCachedInventoryContributionsForProjects,
  loadCachedMonthCloseEconomicForProjects,
} from './financials-request-load-cache';
import type { DirectActualAllocationBasis } from './preview-general-cost-month';

export async function loadDirectActualBasisByProject(
  context: OrgContext,
  projectIds: readonly string[],
  currency: string,
): Promise<readonly DirectActualAllocationBasis[]> {
  if (projectIds.length === 0) return [];

  const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
  const canReadWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);
  const monthCostsReady = canReadWorkforce && areEmployeeMonthCostsAvailable();
  const normalized = currency.toUpperCase();
  const projectIdSet = new Set(projectIds);

  const t0 = performance.now();

  const [allExpenses, laborByProject, monthlyLaborByProject, recognizedByProject, monthCloseByProject, inventoryRows] =
    await Promise.all([
      canReadExpenses
        ? loadCachedOrganizationExpenseContributions(context.db, context.organizationId)
        : Promise.resolve([] as readonly ProjectExpenseContribution[]),
      canReadWorkforce
        ? sumLaborCostGroupedByProject(context.db, context.organizationId, projectIds, normalized)
        : Promise.resolve(new Map()),
      monthCostsReady
        ? sumMonthlyAllocatedLaborByProject(
            context.db,
            context.organizationId,
            projectIds,
            normalized,
          )
        : Promise.resolve(new Map()),
      canReadAp
        ? loadRecognizedVendorBillsForProjects(
            context.db,
            context.organizationId,
            projectIds,
            normalized,
          )
        : Promise.resolve(new Map()),
      loadCachedMonthCloseEconomicForProjects(
        context.db,
        context.organizationId,
        projectIds,
        normalized,
      ),
      canReadExpenses
        ? loadCachedInventoryContributionsForProjects(
            context.db,
            context.organizationId,
            projectIds,
          )
        : Promise.resolve([] as ProjectExpenseContribution[]),
    ]);

  const inventoryByProject = groupContributionsByProject(inventoryRows);

  const expensesByProject = groupContributionsByProject(
    allExpenses.filter((row) => row.projectId != null && projectIdSet.has(row.projectId)),
  );

  const result: DirectActualAllocationBasis[] = [];
  for (const projectId of projectIds) {
    const projectCurrency = normalized;
    const expenseLines = canReadExpenses
      ? [...(expensesByProject.get(projectId) ?? []), ...(inventoryByProject.get(projectId) ?? [])]
      : [];

    const laborAgg = laborByProject.get(projectId);
    const monthlyAgg = monthlyLaborByProject.get(projectId);
    const residualTimeLabor =
      fromNumericString(laborAgg?.totalAmount ?? '0', projectCurrency) ?? zeroMoney(projectCurrency);
    const monthlyAllocatedLabor =
      fromNumericString(monthlyAgg?.totalAmount ?? '0', projectCurrency) ?? zeroMoney(projectCurrency);
    const hasWorkforce = hasWorkforceLaborData({
      residualEntryCount: laborAgg?.entryCount ?? 0,
      monthlyAllocatedLabor,
    });

    const laborInput =
      canReadWorkforce && hasWorkforce
        ? {
            laborCost: mergeResidualTimeAndMonthlyAllocatedLabor({
              residualTimeLabor,
              monthlyAllocatedLabor,
            }),
            hasWorkforceData: true as const,
            entriesMissingCost: laborAgg?.entriesMissingCost ?? 0,
            excludedForeignCurrencyEntries: laborAgg?.excludedForeignCurrencyEntries ?? 0,
          }
        : null;

    const recognized = canReadAp ? recognizedByProject.get(projectId) : null;
    const linked = recognized?.linkedExpenseDeductions ?? new Map<string, string>();
    const expensesForActual = applyLinkedExpenseDeductionsToContributions(expenseLines, linked);

    const hasRecognizedBills = (recognized?.billCount ?? 0) > 0;
    let cost =
      expensesForActual.length > 0 || laborInput?.hasWorkforceData || hasRecognizedBills
        ? aggregateProjectCosts(expensesForActual, laborInput, projectCurrency).cost
        : aggregateProjectCosts([], null, projectCurrency).cost;

    if (recognized) {
      const recognition = composeVendorCostRecognition({
        currency: projectCurrency,
        recognizedBillAmounts: recognized.billAmounts,
        linkedExpenseAmounts: [],
      });
      cost = withRecognizedVendorBills(cost, recognition.netRecognizedVendorActual);
    }

    const monthClose = monthCloseByProject.get(projectId)?.costNet;
    if (monthClose && !isZeroMoney(monthClose) && monthClose.currency === projectCurrency) {
      const actualCostToDate = roundMoney(addMoney(cost.actualCostToDate, monthClose));
      cost = {
        ...cost,
        actualCostToDate,
        directActualCostToDate: actualCostToDate,
      };
    } else {
      cost = {
        ...cost,
        directActualCostToDate: roundMoney(cost.actualCostToDate),
      };
    }

    result.push({
      projectId,
      directActual: cost.directActualCostToDate ?? cost.actualCostToDate,
    });
  }

  if (process.env.PF_TAB_PROFILE === '1') {
    console.error(
      `[gcm-basis] projects=${projectIds.length} ms=${Math.round(performance.now() - t0)}`,
    );
  }

  return result;
}

function groupContributionsByProject(
  rows: readonly ProjectExpenseContribution[],
): Map<string, ProjectExpenseContribution[]> {
  const map = new Map<string, ProjectExpenseContribution[]>();
  for (const row of rows) {
    if (!row.projectId) continue;
    const list = map.get(row.projectId) ?? [];
    list.push(row);
    map.set(row.projectId, list);
  }
  return map;
}
