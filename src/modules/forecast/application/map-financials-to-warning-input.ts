import type { ProjectFinancials } from '@/modules/financials/domain/types';
import type { EarlyWarningInput } from '../domain/types';

export function mapFinancialsToWarningInput(input: {
  readonly financials: ProjectFinancials;
  readonly budgetAmount: string | null;
  readonly progressPercent: string | null;
  readonly canReadBudget: boolean;
  readonly canReadBilling: boolean;
  readonly canReadProfit: boolean;
}): EarlyWarningInput {
  const { financials } = input;
  return {
    projectId: financials.projectId,
    workKind: financials.workKind,
    currency: financials.currency,
    priceNotSet: financials.priceNotSet,
    currentContractAmount: financials.commercial?.currentContractValue.amount ?? null,
    actualCostAmount: financials.cost.actualCostToDate.amount,
    forecastFinalCostAmount: financials.cost.estimatedFinalCost.amount,
    committedOpenAmount: financials.cost.committedOpen.amount,
    expectedRemainingAmount: financials.cost.expectedRemainingCost.amount,
    invoicedAmount: financials.billing.invoiced.amount,
    outstandingAmount: financials.billing.outstanding.amount,
    actualMarginPercent: financials.profit?.actualMarginPercent ?? null,
    forecastMarginPercent: financials.profit?.marginPercent ?? null,
    budgetAmount: input.budgetAmount,
    progressPercent: input.progressPercent,
    dataConfidenceLevel: financials.dataConfidence.level,
    canReadProfit: input.canReadProfit,
    canReadBudget: input.canReadBudget,
    canReadBilling: input.canReadBilling,
  };
}
