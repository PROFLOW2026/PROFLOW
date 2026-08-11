import { composeVendorCostRecognition } from '@/modules/ap/domain/vendor-cost-recognition';
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
import {
  buildFinancialCoverage,
  defaultCostSourcePresence,
  mergeCoveragePartials,
} from '../domain/coverage';
import {
  aggregateProjectCosts,
  emptyCostPosition,
  withCommittedAndApPayable,
  withRecognizedVendorBills,
  type LaborCostContribution,
  type ProjectExpenseContribution,
} from '../domain/cost-aggregation';
import { dataConfidenceFromCoverage } from '../domain/data-confidence';
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
 * Used by getProjectFinancials and the set-based org rollup — formulas stay identical.
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
  readonly commercialData: ProjectCommercialData | null;
  readonly billingRows: ProjectBillingRows | null;
  readonly expenseContributions: readonly ProjectExpenseContribution[];
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
   * Closed history is never rewritten — these rows add to composed totals once.
   */
  readonly monthCloseEconomic?: {
    readonly costNet: MoneyValue;
    readonly revenueNet: MoneyValue;
  };
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
    paid: zeroMoney(currency),
    outstanding: zeroMoney(currency),
    monthCloseRevenueNet: zeroMoney(currency),
  };

  let billingPartials: CoveragePartial[] = [];

  if (input.canReadBilling && input.billingRows) {
    const position = computeBillingPositionFromRows(input.billingRows, currency);
    billing = {
      invoiced: position.invoiced,
      paid: position.paid,
      outstanding: position.outstanding,
      monthCloseRevenueNet: zeroMoney(currency),
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

  const linkedExpenseIds = input.recognizedVendor?.linkedExpenseIds ?? new Set<string>();
  const expensesForActual =
    linkedExpenseIds.size === 0
      ? input.expenseContributions
      : input.expenseContributions.filter(
          (line) => !line.expenseId || !linkedExpenseIds.has(line.expenseId),
        );

  const hasRecognizedBills = (input.recognizedVendor?.billCount ?? 0) > 0;
  const aggregated =
    expensesForActual.length > 0 || input.laborInput?.hasWorkforceData || hasRecognizedBills
      ? aggregateProjectCosts(expensesForActual, input.laborInput, currency)
      : { cost: emptyCostPosition(currency), sources: defaultCostSourcePresence(), partials: [] };

  let { cost } = aggregated;
  const { sources, partials } = aggregated;
  const commitmentPartials: CoveragePartial[] = [];

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
    };
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

  cost = withCommittedAndApPayable(cost, committedOpen, openApPayable, expectedRemainingCost);
  const coverage = buildFinancialCoverage(
    sources,
    new Date(),
    mergeCoveragePartials(partials, billingPartials, commitmentPartials),
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
  const profit =
    input.canReadProfit && commercial && !priceNotSet
      ? roundProfitPosition(
          computeProfitPosition(
            commercial.currentContractValue,
            cost.estimatedFinalCost,
            cost.actualCostToDate,
          ),
        )
      : null;

  // Same Actual / Forecast / margin engine — confidence only labels incompleteness.
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
  };
}
