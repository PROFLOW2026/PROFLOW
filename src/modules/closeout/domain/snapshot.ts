/**
 * Final closeout snapshot from the existing financial engine only.
 * VAT must not distort profitability — reuse net figures as composed.
 */

import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { subtractMoney, type MoneyValue } from '@/shared/money';
import type { CloseoutFinancialSnapshot, SerializedMoney } from './types';

function serializeMoney(value: MoneyValue): SerializedMoney {
  return { amount: value.amount, currency: value.currency };
}

export function buildCloseoutFinancialSnapshot(
  financials: ProjectFinancials,
  options: {
    readonly canReadProfit: boolean;
    readonly retentionHeld?: MoneyValue | null;
    readonly capturedAt?: Date;
  },
): CloseoutFinancialSnapshot {
  const commercial = financials.commercial;
  const approvedChanges =
    commercial != null
      ? subtractMoney(commercial.currentContractValue, commercial.originalContractValue)
      : null;
  const profitHidden = !options.canReadProfit || financials.profit == null;
  const profit = profitHidden ? null : financials.profit;

  return {
    currency: financials.currency,
    capturedAt: (options.capturedAt ?? new Date()).toISOString(),
    originalContract: commercial ? serializeMoney(commercial.originalContractValue) : null,
    currentContract: commercial ? serializeMoney(commercial.currentContractValue) : null,
    approvedChanges: approvedChanges ? serializeMoney(approvedChanges) : null,
    actualCost: serializeMoney(financials.cost.actualCostToDate),
    remainingCommitments: serializeMoney(financials.cost.committedOpen),
    totalBilling: serializeMoney(financials.billing.invoiced),
    paymentsReceived: serializeMoney(financials.billing.paid),
    outstandingClient: serializeMoney(financials.billing.outstanding),
    supplierOutstanding: serializeMoney(financials.cost.openApPayable),
    retentionHeld: options.retentionHeld ? serializeMoney(options.retentionHeld) : null,
    expectedProfit: profit ? serializeMoney(profit.actualProfit) : null,
    marginPercent: profit?.actualMarginPercent ?? null,
    profitHidden,
  };
}
