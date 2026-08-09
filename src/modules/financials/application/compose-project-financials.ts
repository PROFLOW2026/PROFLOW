import { composeVendorCostRecognition } from '@/modules/ap/domain/vendor-cost-recognition';
import { excludeCommittedFromActualCost } from '@/modules/procurement/domain/committed-cost';
import type {
  BillingPosition,
  CommercialPosition,
  CoveragePartial,
  ProjectFinancials,
} from '@/modules/financials/domain/types';
import { fromNumericString, zeroMoney, type MoneyValue } from '@/shared/money';
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
import { computeProfitPosition, roundProfitPosition } from '../domain/profit';
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
  };

  let billingPartials: CoveragePartial[] = [];

  if (input.canReadBilling && input.billingRows) {
    const position = computeBillingPositionFromRows(input.billingRows, currency);
    billing = {
      invoiced: position.invoiced,
      paid: position.paid,
      outstanding: position.outstanding,
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

  const profit =
    input.canReadProfit && commercial
      ? roundProfitPosition(
          computeProfitPosition(
            commercial.currentContractValue,
            cost.estimatedFinalCost,
            cost.actualCostToDate,
          ),
        )
      : null;

  return {
    projectId: input.projectId,
    currency: input.commercialData?.currency ?? currency,
    commercial,
    billing,
    cost,
    profit,
    coverage,
  };
}
