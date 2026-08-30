/**
 * Batched Financials read layer — fewer SQL round trips inside the same RLS transaction.
 * Raw facts only; existing domain/composer functions consume the bundle.
 */

import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  addMoney,
  fromNumericString,
  isZeroMoney,
  roundMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { seedCachedClosedYearMonthsSet } from '@/modules/month-close/application/closed-periods-read-cache';
import { parseLaborCostDefaults } from '@/modules/tenancy/domain/labor-cost-defaults';
import {
  parseProjectProfitabilityMode,
  type ProjectProfitabilityMode,
} from '@/modules/tenancy/domain/project-profitability-mode';
import {
  hasWorkforceLaborData,
  mergeResidualTimeAndMonthlyAllocatedLabor,
} from '@/modules/workforce';
import { areEmployeeMonthCostsAvailable } from '@/modules/workforce/domain/monthly-cost-gates';
import { previewCurrentMonthAllocatedLaborForProject } from '@/modules/workforce/application/preview-project-monthly-labor-allocation';
import type { ProjectCommercialData } from '../data/commercial.repository';
import { loadProjectCommercialData } from '../data/commercial.repository';
import type { ProjectBillingRows } from '../data/billing.repository';
import type { RecognizedVendorBillRollup } from '../data/committed-costs.repository';
import type { ProjectIncompletenessSignals } from '../data/incompleteness.repository';
import type { MonthCloseEconomicNets } from '../data/month-close-economic.repository';
import type { ProjectExpenseContribution } from '../domain/cost-aggregation';
import type { ResolvedProjectGeneralAllocations } from './resolve-project-general-allocations';
import {
  loadFinancialsApOrgFactsBundle,
  loadFinancialsBillingBundle,
  loadFinancialsGcmStoredBundle,
  loadFinancialsLaborAggregateBundle,
  loadFinancialsOrgPreflightBundle,
  loadFinancialsProcurementBundle,
  loadFinancialsProjectSetupBundle,
} from '../data/financials-read-bundle.repository';
import { seedApOrgReadFactsCache } from '@/modules/ap/data/ap-read-facts-cache';
import {
  loadCachedMonthCloseEconomicByProject,
  loadCachedMonthCloseEconomicForProject,
  loadCachedOrganizationExpenseContributions,
  loadCachedOrganizationInventoryContributions,
  loadCachedProjectExpenseContributions,
  loadCachedProjectInventoryContributions,
  seedCachedLaborCostDefaults,
} from './financials-request-load-cache';
import {
  foldOpenApPayableFromApBundle,
  foldRecognizedVendorBillsFromApBundle,
} from './fold-financials-ap-bundle';
import { foldBillingRowsFromBundle } from './fold-financials-billing-bundle';
import {
  actualRecognitionThroughYearMonth,
  compareYearMonth,
} from '../domain/general-cost-actual-recognition';
import {
  previewGeneralCostMonthAllocations,
  previewLineAmountForProject,
} from './preview-general-cost-month';
import { sumSubcontractRemainingCommitmentForProject } from '../data/subcontract-commitment.repository';
import { mergeProjectRemainingCommitments } from '../domain/merge-commitments';

export type ProjectFinancialsReadBundle = {
  readonly projectId: string;
  readonly currency: string;
  readonly forecastInputs: {
    readonly expectedRemainingCostAmount: string | null;
    readonly workKind: string;
    readonly pricingMode: string | null;
  };
  readonly incompleteness: ProjectIncompletenessSignals;
  readonly commercialData: ProjectCommercialData | null;
  readonly billingRows: ProjectBillingRows | null;
  readonly expenseContributions: ProjectExpenseContribution[] | null;
  readonly inventoryContributions: ProjectExpenseContribution[];
  readonly laborInput: {
    readonly laborCost: MoneyValue;
    readonly hasWorkforceData: boolean;
    readonly entriesMissingCost: number;
    readonly excludedForeignCurrencyEntries: number;
  } | null;
  readonly committed: { total: MoneyValue; excludedForeignCurrencyCount: number } | null;
  readonly subcontract: { total: MoneyValue; excludedForeignCurrencyCount: number } | null;
  readonly openAp: { total: MoneyValue; excludedForeignCurrencyCount: number; billCount: number } | null;
  readonly recognizedVendor: RecognizedVendorBillRollup | null;
  readonly monthCloseEconomic: MonthCloseEconomicNets;
  readonly generalResolved: ResolvedProjectGeneralAllocations;
  readonly projectProfitabilityMode: ProjectProfitabilityMode;
};

const bundleByTx = new WeakMap<object, Map<string, Promise<ProjectFinancialsReadBundle>>>();

export async function loadProjectFinancialsReadBundle(
  context: OrgContext,
  projectId: string,
): Promise<ProjectFinancialsReadBundle> {
  const txKey = context.db as object;
  let byProject = bundleByTx.get(txKey);
  if (!byProject) {
    byProject = new Map();
    bundleByTx.set(txKey, byProject);
  }
  const hit = byProject.get(projectId);
  if (hit) return hit;
  const pending = loadProjectFinancialsReadBundleUncached(context, projectId);
  byProject.set(projectId, pending);
  return pending;
}

async function resolveGeneralFromBundle(
  context: OrgContext,
  projectId: string,
  currency: string,
  gcmStored: Awaited<ReturnType<typeof loadFinancialsGcmStoredBundle>>,
): Promise<ResolvedProjectGeneralAllocations> {
  const throughYearMonth = actualRecognitionThroughYearMonth(context.organization.timezone);
  const futureMonths = gcmStored.futureCandidateMonths.filter(
    (yearMonth) => compareYearMonth(yearMonth, throughYearMonth) > 0,
  );
  const previewMonths = [throughYearMonth, ...futureMonths];
  const previews = await previewGeneralCostMonthAllocations(context, previewMonths, {
    allowFuture: true,
  });

  let recognized =
    fromNumericString(gcmStored.storedBeforeCurrent, currency) ?? zeroMoney(currency);
  const currentPreview = previews.get(throughYearMonth);
  if (currentPreview && !currentPreview.skipped) {
    recognized = addMoney(
      recognized,
      previewLineAmountForProject(currentPreview, projectId, currency),
    );
  } else {
    recognized = addMoney(
      recognized,
      fromNumericString(gcmStored.storedCurrent, currency) ?? zeroMoney(currency),
    );
  }

  let futureForecast = zeroMoney(currency);
  for (const yearMonth of futureMonths) {
    const preview = previews.get(yearMonth);
    if (!preview || preview.skipped) continue;
    const share = previewLineAmountForProject(preview, projectId, currency);
    if (!isZeroMoney(share)) {
      futureForecast = addMoney(futureForecast, share);
    }
  }

  return {
    recognizedActual: roundMoney(recognized),
    futureForecast: roundMoney(futureForecast),
  };
}

async function loadProjectFinancialsReadBundleUncached(
  context: OrgContext,
  projectId: string,
): Promise<ProjectFinancialsReadBundle> {
  const canReadCommercial = hasPermission(context, PERMISSIONS.CONTRACTS_READ);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canReadProcurement = hasPermission(context, PERMISSIONS.PROCUREMENT_READ);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
  const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);
  const canReadWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);

  const [setup, orgPreflight, apOrgFacts] = await Promise.all([
    loadFinancialsProjectSetupBundle(context.db, context.organizationId, projectId),
    loadFinancialsOrgPreflightBundle(context.db, context.organizationId),
    canReadAp
      ? loadFinancialsApOrgFactsBundle(context.db, context.organizationId)
      : Promise.resolve(null),
  ]);
  if (!setup.exists) throw new NotFoundError('Project');

  const currency = (setup.currency ?? context.organization.baseCurrency).toUpperCase();
  const throughYearMonth = actualRecognitionThroughYearMonth(context.organization.timezone);

  if (apOrgFacts) {
    seedApOrgReadFactsCache(context.db as object, apOrgFacts);
  }
  seedCachedClosedYearMonthsSet(context.db as object, orgPreflight.closedYearMonths);
  seedCachedLaborCostDefaults(
    context.db as object,
    parseLaborCostDefaults(orgPreflight.laborCostDefaultsRaw),
  );
  const projectProfitabilityMode = parseProjectProfitabilityMode(
    orgPreflight.projectProfitabilityModeRaw,
  );

  if (canReadExpenses) {
    await Promise.all([
      loadCachedOrganizationExpenseContributions(context.db, context.organizationId),
      loadCachedOrganizationInventoryContributions(context.db, context.organizationId),
    ]);
  }
  await loadCachedMonthCloseEconomicByProject(context.db, context.organizationId, currency);

  const [
    commercialData,
    billingBundle,
    procurement,
    subcontractResult,
    gcmStored,
    laborAggregate,
    previewCurrentMonth,
  ] = await Promise.all([
    canReadCommercial
      ? loadProjectCommercialData(context.db, context.organizationId, projectId)
      : Promise.resolve(null),
    canReadBilling
      ? loadFinancialsBillingBundle(context.db, context.organizationId, projectId)
      : Promise.resolve(null),
    canReadProcurement
      ? loadFinancialsProcurementBundle(context.db, context.organizationId, projectId, currency)
      : Promise.resolve(null),
    canReadProcurement && canReadAp
      ? sumSubcontractRemainingCommitmentForProject(
          context.db,
          context.organizationId,
          projectId,
          currency,
        )
      : Promise.resolve(null),
    loadFinancialsGcmStoredBundle(
      context.db,
      context.organizationId,
      projectId,
      currency,
      throughYearMonth,
    ),
    canReadWorkforce && areEmployeeMonthCostsAvailable()
      ? loadFinancialsLaborAggregateBundle(
          context.db,
          context.organizationId,
          projectId,
          currency,
          throughYearMonth,
        )
      : Promise.resolve(null),
    canReadWorkforce && areEmployeeMonthCostsAvailable()
      ? previewCurrentMonthAllocatedLaborForProject(context, projectId, currency)
      : Promise.resolve(zeroMoney(currency)),
  ]);

  const generalResolved = await resolveGeneralFromBundle(
    context,
    projectId,
    currency,
    gcmStored,
  );

  const expenseContributions = canReadExpenses
    ? await loadCachedProjectExpenseContributions(context.db, context.organizationId, projectId)
    : null;
  const inventoryContributions = canReadExpenses
    ? await loadCachedProjectInventoryContributions(context.db, context.organizationId, projectId)
    : [];

  const monthCloseEconomic = await loadCachedMonthCloseEconomicForProject(
    context.db,
    context.organizationId,
    projectId,
    currency,
  );

  let laborInput: ProjectFinancialsReadBundle['laborInput'] = null;
  if (canReadWorkforce && laborAggregate) {
    const appliedPrior =
      fromNumericString(laborAggregate.appliedPriorTotal, currency) ?? zeroMoney(currency);
    const monthlyAllocatedLabor = addMoney(appliedPrior, previewCurrentMonth);
    const residualTimeLabor =
      fromNumericString(laborAggregate.residual.totalAmount, currency) ?? zeroMoney(currency);
    laborInput = {
      laborCost: mergeResidualTimeAndMonthlyAllocatedLabor({
        residualTimeLabor,
        monthlyAllocatedLabor,
      }),
      hasWorkforceData: hasWorkforceLaborData({
        residualEntryCount: laborAggregate.residual.entryCount,
        monthlyAllocatedLabor,
      }),
      entriesMissingCost: laborAggregate.residual.entriesMissingCost,
      excludedForeignCurrencyEntries: laborAggregate.residual.excludedForeignCurrencyEntries,
    };
  }

  return {
    projectId,
    currency,
    forecastInputs: {
      expectedRemainingCostAmount: setup.expectedRemainingCostAmount,
      workKind: setup.workKind ?? 'project',
      pricingMode: setup.pricingMode,
    },
    incompleteness: {
      openDraftDocumentCount: setup.openDraftDocumentCount,
      openAllocationCount: setup.openAllocationCount,
    },
    commercialData,
    billingRows: billingBundle ? foldBillingRowsFromBundle(billingBundle) : null,
    expenseContributions,
    inventoryContributions,
    laborInput,
    committed: procurement
      ? {
          total:
            fromNumericString(procurement.committedAmount, currency) ?? zeroMoney(currency),
          excludedForeignCurrencyCount: procurement.committedExcludedFx,
        }
      : null,
    subcontract: subcontractResult,
    openAp:
      apOrgFacts && canReadAp
        ? foldOpenApPayableFromApBundle(apOrgFacts, projectId, currency)
        : null,
    recognizedVendor:
      apOrgFacts && canReadAp
        ? foldRecognizedVendorBillsFromApBundle(apOrgFacts, projectId, currency)
        : null,
    monthCloseEconomic,
    generalResolved,
    projectProfitabilityMode,
  };
}

export function mergeBundleCommitted(
  bundle: ProjectFinancialsReadBundle,
): { total: MoneyValue; excludedForeignCurrencyCount: number } | null {
  if (!bundle.committed && !bundle.subcontract) return null;
  return {
    total: mergeProjectRemainingCommitments({
      currency: bundle.currency,
      poCommitted: bundle.committed?.total ?? zeroMoney(bundle.currency),
      subcontractRemaining: bundle.subcontract?.total ?? zeroMoney(bundle.currency),
    }),
    excludedForeignCurrencyCount:
      (bundle.committed?.excludedForeignCurrencyCount ?? 0) +
      (bundle.subcontract?.excludedForeignCurrencyCount ?? 0),
  };
}
