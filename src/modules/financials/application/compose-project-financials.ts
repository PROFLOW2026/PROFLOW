import { composeVendorCostRecognition } from '@/modules/ap/domain/vendor-cost-recognition';
import type { ProjectProfitabilityMode } from '@/modules/tenancy/domain/project-profitability-mode';
import { excludeCommittedFromActualCost } from '@/modules/procurement/domain/committed-cost';
import type {
  BillingPosition,
  CommercialPosition,
  CoveragePartial,
  PricingMode,
  ProjectFinancials,
  WorkKind,
} from '@/modules/financials/domain/types';
import {
  addMoney,
  fromNumericString,
  isZeroMoney,
  roundMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { applyLinkedExpenseDeductionsToContributions } from '../domain/expense-ap-dedup';
import {
  buildFinancialCoverage,
  defaultCostSourcePresence,
  mergeCoveragePartials,
} from '../domain/coverage';
import {
  aggregateProjectCosts,
  emptyCostPosition,
  withAllocatedGeneralBusinessCost,
  withCommittedAndApPayable,
  withRecognizedVendorBills,
  type LaborCostContribution,
  type ProjectExpenseContribution,
} from '../domain/cost-aggregation';
import { dataConfidenceFromCoverage } from '../domain/data-confidence';
import {
  buildSliceAvailability,
  type FinancialSliceAvailability,
} from '../domain/slice-availability';
import { computeProfitPosition, roundProfitPosition } from '../domain/profit';
import {
  hasRevenueBasisForProfitability,
  normalizePricingMode,
  normalizeWorkKind,
} from '../domain/work-pricing';
import {
  computeBillingPositionFromRows,
  type ProjectBillingRows,
} from '../data/billing.repository';
import {
  emptyCommercialPosition,
  type ProjectCommercialData,
} from '../data/commercial.repository';
import type { RecognizedVendorBillRollup } from '../data/committed-costs.repository';

/**
 * Shared financial composition for a single project.
 * Used by getProjectFinancials and the set-based org rollup - formulas stay identical.
 */
export interface ProjectFinancialsLoadedSlices {
  readonly projectId: string;
  readonly currency: string;
  readonly expectedRemainingCostAmount: string | null;
  readonly workKind?: WorkKind | string | null;
  readonly pricingMode?: PricingMode | string | null;
  readonly canReadCommercial: boolean;
  readonly canReadBilling: boolean;
  readonly canReadProfit: boolean;
  readonly canReadExpenses?: boolean;
  readonly canReadWorkforce?: boolean;
  readonly canReadProcurement?: boolean;
  readonly canReadAp?: boolean;
  readonly commercialData: ProjectCommercialData | null;
  readonly billingRows: ProjectBillingRows | null;
  /** Null when expenses.read withheld — never substitute []. */
  readonly expenseContributions: readonly ProjectExpenseContribution[] | null;
  readonly laborInput: LaborCostContribution | null;
  readonly committed:
    | { readonly total: MoneyValue; readonly excludedForeignCurrencyCount: number }
    | null;
  readonly openAp:
    | {
        readonly total: MoneyValue;
        readonly excludedForeignCurrencyCount: number;
        readonly billCount: number;
      }
    | null;
  readonly recognizedVendor: RecognizedVendorBillRollup | null;
  /**
   * Optional incompleteness extras for DATA CONFIDENCE (Agent 3).
   * Coverage partials (missing employer cost, FX) are always applied.
   */
  readonly incompleteness?: {
    readonly unallocatedRemainder?: MoneyValue | null;
    readonly openDraftDocumentCount?: number;
    readonly openAllocationCount?: number;
  };
  /**
   * Non-superseded month-close economic corrections for this project.
   * Closed history is never rewritten - these rows add to composed totals once.
   */
  readonly monthCloseEconomic?: {
    readonly costNet: MoneyValue;
    readonly revenueNet: MoneyValue;
  };
  /**
   * Auto-allocated general business cost for this project (sum across months).
   * Attribution only — does not change Company Actual pool recognition.
   */
  readonly allocatedGeneralBusinessCost?: MoneyValue | null;
  readonly futureGeneralAllocatedForecast?: MoneyValue | null;
  readonly sliceAvailability?: FinancialSliceAvailability;
  /** Org presentation mode — attached to output; does not alter economics. */
  readonly projectProfitabilityMode?: ProjectProfitabilityMode;
}

export function composeProjectFinancials(
  input: ProjectFinancialsLoadedSlices,
): ProjectFinancials {
  const { currency } = input;

  const commercial: CommercialPosition | null = input.canReadCommercial
    ? (input.commercialData?.position ?? emptyCommercialPosition(currency))
    : null;

  let billing: BillingPosition = {
    invoiced: zeroMoney(currency),
    netInvoiced: zeroMoney(currency),
    paid: zeroMoney(currency),
    outstanding: zeroMoney(currency),
    monthCloseRevenueNet: zeroMoney(currency),
    hasBillingData: false,
  };

  let billingPartials: CoveragePartial[] = [];

  if (input.canReadBilling && input.billingRows) {
    const position = computeBillingPositionFromRows(input.billingRows, currency);
    billing = {
      invoiced: position.invoiced,
      netInvoiced: position.netInvoiced,
      paid: position.paid,
      outstanding: position.outstanding,
      monthCloseRevenueNet: zeroMoney(currency),
      hasBillingData: position.hasBillingData,
    };
    if (position.excludedForeignCurrencyRecordCount > 0) {
      billingPartials = [
        {
          reason: 'foreign_currency_billing_excluded',
          count: position.excludedForeignCurrencyRecordCount,
        },
      ];
    }
  }

  const linkedExpenseDeductions =
    input.recognizedVendor?.linkedExpenseDeductions ?? new Map<string, string>();
  const expensesForActual = applyLinkedExpenseDeductionsToContributions(
    input.expenseContributions ?? [],
    linkedExpenseDeductions,
  );

  const hasRecognizedBills = (input.recognizedVendor?.billCount ?? 0) > 0;
  const aggregated =
    expensesForActual.length > 0 || input.laborInput?.hasWorkforceData || hasRecognizedBills
      ? aggregateProjectCosts(expensesForActual, input.laborInput, currency)
      : { cost: emptyCostPosition(currency), sources: defaultCostSourcePresence(), partials: [] };

  let { cost } = aggregated;
  const { sources, partials } = aggregated;
  const commitmentPartials: CoveragePartial[] = [];
  const commercialPartials: CoveragePartial[] = [];
  const excludedFxContracts = input.commercialData?.excludedForeignCurrencyContractCount ?? 0;
  if (excludedFxContracts > 0) {
    commercialPartials.push({
      reason: 'foreign_currency_contracts_excluded',
      count: excludedFxContracts,
    });
  }

  if (input.recognizedVendor) {
    const recognition = composeVendorCostRecognition({
      currency,
      recognizedBillAmounts: input.recognizedVendor.billAmounts,
      linkedExpenseAmounts: [],
    });
    cost = withRecognizedVendorBills(cost, recognition.netRecognizedVendorActual);
    if (input.recognizedVendor.excludedForeignCurrencyCount > 0) {
      commitmentPartials.push({
        reason: 'foreign_currency_ap_excluded',
        count: input.recognizedVendor.excludedForeignCurrencyCount,
      });
    }
  }

  const costAdjustment = input.monthCloseEconomic?.costNet;
  if (costAdjustment && !isZeroMoney(costAdjustment) && costAdjustment.currency !== currency) {
    throw new Error('Month-close cost currency must match project cost currency');
  }
  if (costAdjustment && costAdjustment.currency === currency && !isZeroMoney(costAdjustment)) {
    const actualCostToDate = roundMoney(addMoney(cost.actualCostToDate, costAdjustment));
    cost = {
      ...cost,
      actualCostToDate,
      estimatedFinalCost: actualCostToDate,
      monthCloseCostNet: roundMoney(costAdjustment),
      directActualCostToDate: actualCostToDate,
    };
  } else {
    cost = {
      ...cost,
      directActualCostToDate: roundMoney(cost.actualCostToDate),
      allocatedGeneralBusinessCost: zeroMoney(currency),
      fullActualCostToDate: roundMoney(cost.actualCostToDate),
    };
  }

  // Attach auto-general AFTER Direct is finalized — Full Actual = Direct + General.
  const allocatedGeneral = input.allocatedGeneralBusinessCost;
  const futureGeneralForecast =
    input.futureGeneralAllocatedForecast ?? zeroMoney(currency);
  if (allocatedGeneral && allocatedGeneral.currency === currency) {
    cost = withAllocatedGeneralBusinessCost(cost, allocatedGeneral);
  }

  const revenueAdjustment = input.monthCloseEconomic?.revenueNet;
  if (
    revenueAdjustment &&
    !isZeroMoney(revenueAdjustment) &&
    revenueAdjustment.currency !== currency
  ) {
    throw new Error('Month-close revenue currency must match project billing currency');
  }
  if (
    revenueAdjustment &&
    revenueAdjustment.currency === currency &&
    !isZeroMoney(revenueAdjustment)
  ) {
    billing = {
      ...billing,
      invoiced: roundMoney(addMoney(billing.invoiced, revenueAdjustment)),
      netInvoiced: roundMoney(addMoney(billing.netInvoiced, revenueAdjustment)),
      outstanding: roundMoney(addMoney(billing.outstanding, revenueAdjustment)),
      monthCloseRevenueNet: roundMoney(revenueAdjustment),
    };
  }

  let committedOpen = zeroMoney(currency);
  if (input.committed) {
    committedOpen = input.committed.total;
    if (input.committed.excludedForeignCurrencyCount > 0) {
      commitmentPartials.push({
        reason: 'foreign_currency_committed_excluded',
        count: input.committed.excludedForeignCurrencyCount,
      });
    }
  }

  let openApPayable = zeroMoney(currency);
  if (input.openAp) {
    openApPayable = input.openAp.total;
    if (input.openAp.excludedForeignCurrencyCount > 0) {
      commitmentPartials.push({
        reason: 'foreign_currency_ap_excluded',
        count: input.openAp.excludedForeignCurrencyCount,
      });
    }
  }

  const expectedRemainingCost =
    fromNumericString(input.expectedRemainingCostAmount, currency) ?? zeroMoney(currency);

  excludeCommittedFromActualCost({
    actualExpenseTotal: cost.actualCostToDate.amount,
    committedOpenTotal: committedOpen.amount,
    currency,
  });

  cost = withCommittedAndApPayable(
    cost,
    committedOpen,
    openApPayable,
    expectedRemainingCost,
    futureGeneralForecast,
  );
  const coverage = buildFinancialCoverage(
    sources,
    new Date(),
    mergeCoveragePartials(partials, billingPartials, commitmentPartials, commercialPartials),
  );

  const workKind = normalizeWorkKind(input.workKind);
  const pricingMode = normalizePricingMode(input.pricingMode ?? null);
  // commercialData null ⇒ no primary contract loaded. For jobs that means no
  // managed revenue basis (open or broken fixed). Classic projects omit this gate.
  const hasManagedContract = input.commercialData != null;
  const priceNotSet = !hasRevenueBasisForProfitability(workKind, pricingMode, {
    hasManagedContract,
  });

  // No revenue basis: cost forecast stays; never claim profit from revenue=0.
  const directActual = roundMoney(cost.directActualCostToDate ?? cost.actualCostToDate);
  const fullActual = roundMoney(
    cost.fullActualCostToDate ??
      addMoney(directActual, cost.allocatedGeneralBusinessCost ?? zeroMoney(currency)),
  );
  const mode = input.projectProfitabilityMode ?? 'direct';
  const forecastForProfit =
    mode === 'include_general' ? cost.fullForecastFinalCost : cost.directForecastFinalCost;
  const actualForProfit = mode === 'include_general' ? fullActual : directActual;
  const profit =
    input.canReadProfit && commercial && !priceNotSet
      ? roundProfitPosition(
          computeProfitPosition(
            commercial.currentContractValue,
            forecastForProfit,
            actualForProfit,
          ),
        )
      : null;

  // Same Actual / Forecast / margin engine - confidence only labels incompleteness.
  const dataConfidence = dataConfidenceFromCoverage(coverage, {
    unallocatedRemainder: input.incompleteness?.unallocatedRemainder,
    openDraftDocumentCount: input.incompleteness?.openDraftDocumentCount,
    openAllocationCount: input.incompleteness?.openAllocationCount,
  });

  return {
    projectId: input.projectId,
    currency: input.commercialData?.currency ?? currency,
    workKind,
    pricingMode,
    priceNotSet,
    commercial,
    billing,
    cost,
    profit,
    coverage,
    dataConfidence,
    projectProfitabilityMode: input.projectProfitabilityMode,
    sliceAvailability:
      input.sliceAvailability ??
      buildSliceAvailability({
        canReadCommercial: input.canReadCommercial,
        canReadBilling: input.canReadBilling,
        canReadExpenses:
          input.canReadExpenses !== false && input.expenseContributions !== null,
        canReadWorkforce: input.canReadWorkforce !== false,
        canReadProcurement: input.canReadProcurement !== false,
        canReadAp: input.canReadAp !== false,
        laborLoaded: input.laborInput?.hasWorkforceData === true,
      }),
    perContract: input.commercialData?.perContract,
  };
}
