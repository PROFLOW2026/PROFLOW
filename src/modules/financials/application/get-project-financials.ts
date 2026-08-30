import type { OrgContext } from '@/shared/auth/context';

import { assertPermission, hasPermission } from '@/shared/permissions/assert';

import { PERMISSIONS } from '@/shared/permissions/catalog';

import {
  buildSliceAvailability,
  resolveProjectKpiAvailability,
} from '../domain/slice-availability';

import { composeProjectFinancials } from './compose-project-financials';

import type { ProjectFinancials } from '@/modules/financials/domain/types';

import {
  loadProjectFinancialsReadBundle,
  mergeBundleCommitted,
} from './load-project-financials-read-bundle';

const financialsByTx = new WeakMap<object, Map<string, Promise<ProjectFinancials>>>();

export async function getProjectFinancials(
  context: OrgContext,
  projectId: string,
): Promise<ProjectFinancials> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);

  const txKey = context.db as object;
  let byProject = financialsByTx.get(txKey);
  if (!byProject) {
    byProject = new Map();
    financialsByTx.set(txKey, byProject);
  }
  const hit = byProject.get(projectId);
  if (hit) return hit;
  const pending = getProjectFinancialsUncached(context, projectId);
  byProject.set(projectId, pending);
  return pending;
}

async function getProjectFinancialsUncached(
  context: OrgContext,
  projectId: string,
): Promise<ProjectFinancials> {
  const t0 = performance.now();
  const bundle = await loadProjectFinancialsReadBundle(context, projectId);
  if (process.env.PF_TAB_PROFILE === '1') {
    console.error(`[getProjectFinancials] bundleMs=${Math.round(performance.now() - t0)}`);
  }

  const currency = bundle.currency;

  const canReadCommercial = hasPermission(context, PERMISSIONS.CONTRACTS_READ);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canReadProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);
  const canReadProcurement = hasPermission(context, PERMISSIONS.PROCUREMENT_READ);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
  const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);
  const canReadWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);

  const expenseContributionsWithInventory = canReadExpenses
    ? [...(bundle.expenseContributions ?? []), ...bundle.inventoryContributions]
    : bundle.expenseContributions;

  const mergedCommitted = mergeBundleCommitted(bundle);

  const sliceAvailabilityFinal = buildSliceAvailability({
    canReadCommercial,
    canReadBilling,
    canReadExpenses,
    canReadWorkforce,
    canReadProcurement,
    canReadAp,
    laborLoaded: bundle.laborInput?.hasWorkforceData === true,
  });

  const composed = composeProjectFinancials({
    projectId,
    currency,
    expectedRemainingCostAmount: bundle.forecastInputs.expectedRemainingCostAmount,
    workKind: bundle.forecastInputs.workKind,
    pricingMode: bundle.forecastInputs.pricingMode,
    canReadCommercial,
    canReadBilling,
    canReadProfit,
    canReadExpenses,
    canReadWorkforce,
    canReadProcurement,
    canReadAp,
    commercialData: bundle.commercialData,
    billingRows: bundle.billingRows,
    expenseContributions: expenseContributionsWithInventory,
    laborInput: bundle.laborInput,
    committed: mergedCommitted,
    openAp: bundle.openAp,
    recognizedVendor: bundle.recognizedVendor,
    monthCloseEconomic: bundle.monthCloseEconomic,
    incompleteness: bundle.incompleteness,
    allocatedGeneralBusinessCost: bundle.generalResolved.recognizedActual,
    futureGeneralAllocatedForecast: bundle.generalResolved.futureForecast,
    projectProfitabilityMode: bundle.projectProfitabilityMode,
    sliceAvailability: sliceAvailabilityFinal,
  });

  return {
    ...composed,
    kpiAvailability: resolveProjectKpiAvailability(composed),
  };
}
