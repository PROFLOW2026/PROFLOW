import type { CostPosition, CoveragePartial } from '@/modules/financials/domain/types';
import {
  addMoney,
  fromNumericString,
  roundMoney,
  sumMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { CostSourcePresence } from './coverage';

export type DbCostFamily =
  | 'direct_project'
  | 'shared'
  | 'business_overhead'
  | 'asset_capital';

export type CostFamilyKey = keyof CostPosition['byFamily'];

export interface ProjectExpenseContribution {
  readonly amount: string;
  readonly currency: string;
  readonly costFamily: DbCostFamily;
  readonly isDirectOnProject: boolean;
  readonly isAllocated: boolean;
  readonly isSubcontractor: boolean;
}

export interface LaborCostContribution {
  readonly laborCost: MoneyValue;
  readonly hasWorkforceData: boolean;
  readonly entriesMissingCost?: number;
  readonly excludedForeignCurrencyEntries?: number;
}

export interface AggregatedProjectCosts {
  readonly cost: CostPosition;
  readonly sources: readonly CostSourcePresence[];
  readonly partials: readonly CoveragePartial[];
}

function familyKeyFromDb(value: string): CostFamilyKey {
  switch (value) {
    case 'direct_project':
      return 'directProject';
    case 'shared':
      return 'shared';
    case 'business_overhead':
      return 'businessOverhead';
    case 'asset_capital':
      return 'assetCapital';
    default:
      return 'directProject';
  }
}

/**
 * Aggregates every cost line that touches a project and derives coverage flags.
 *
 * V1 has no separate forecasting engine: estimated final cost equals actual cost
 * to date when no remaining-cost inputs exist (doc 04 §3).
 */
export function aggregateProjectCosts(
  contributions: readonly ProjectExpenseContribution[],
  labor: LaborCostContribution | null,
  currency: string,
): AggregatedProjectCosts {
  const normalizedCurrency = currency.toUpperCase();
  const byFamily: Record<CostFamilyKey, MoneyValue> = {
    directProject: zeroMoney(currency),
    shared: zeroMoney(currency),
    businessOverhead: zeroMoney(currency),
    assetCapital: zeroMoney(currency),
  };

  let hasDirectExpenseRows = false;
  let hasSharedRows = false;
  let hasOverheadAllocationRows = false;
  let hasSubcontractorRows = false;
  let excludedForeignCurrencyExpenses = 0;

  for (const line of contributions) {
    if (line.currency.toUpperCase() !== normalizedCurrency) {
      excludedForeignCurrencyExpenses += 1;
      continue;
    }

    const amount = fromNumericString(line.amount, line.currency);
    if (!amount) continue;

    const family = familyKeyFromDb(line.costFamily);
    byFamily[family] = addMoney(byFamily[family]!, amount);

    if (line.isSubcontractor) hasSubcontractorRows = true;

    if (line.isDirectOnProject && !line.isAllocated) {
      hasDirectExpenseRows = true;
    }

    if (line.isAllocated) {
      if (family === 'shared') hasSharedRows = true;
      if (family === 'businessOverhead') hasOverheadAllocationRows = true;
      if (family === 'directProject') hasDirectExpenseRows = true;
    }

    if (!line.isAllocated && line.isDirectOnProject) {
      if (family === 'shared') hasSharedRows = true;
      if (family === 'directProject') hasDirectExpenseRows = true;
    }
  }

  if (labor?.hasWorkforceData) {
    byFamily.directProject = addMoney(byFamily.directProject, labor.laborCost);
  }

  const familyValues = Object.values(byFamily);
  const actualCostToDate = roundMoney(sumMoney(familyValues, currency));

  const sources: CostSourcePresence[] = [
    { source: 'direct_expenses', hasData: hasDirectExpenseRows },
    {
      source: 'workforce',
      hasData: labor?.hasWorkforceData ?? false,
    },
    { source: 'allocated_overhead', hasData: hasOverheadAllocationRows },
    { source: 'shared_costs', hasData: hasSharedRows },
    { source: 'subcontractor', hasData: hasSubcontractorRows },
  ];

  const partials: CoveragePartial[] = [];
  if (excludedForeignCurrencyExpenses > 0) {
    partials.push({
      reason: 'foreign_currency_expenses_excluded',
      count: excludedForeignCurrencyExpenses,
    });
  }
  if ((labor?.entriesMissingCost ?? 0) > 0) {
    partials.push({
      reason: 'workforce_entries_missing_cost',
      count: labor!.entriesMissingCost,
    });
  }
  if ((labor?.excludedForeignCurrencyEntries ?? 0) > 0) {
    partials.push({
      reason: 'foreign_currency_labor_excluded',
      count: labor!.excludedForeignCurrencyEntries,
    });
  }

  return {
    cost: {
      actualCostToDate,
      estimatedFinalCost: actualCostToDate,
      byFamily: {
        directProject: roundMoney(byFamily.directProject),
        shared: roundMoney(byFamily.shared),
        businessOverhead: roundMoney(byFamily.businessOverhead),
        assetCapital: roundMoney(byFamily.assetCapital),
      },
    },
    sources,
    partials,
  };
}

export function emptyCostPosition(currency: string): CostPosition {
  const zero = zeroMoney(currency);
  return {
    actualCostToDate: zero,
    estimatedFinalCost: zero,
    byFamily: {
      directProject: zero,
      shared: zero,
      businessOverhead: zero,
      assetCapital: zero,
    },
  };
}

export function moneyFromAmount(amount: string | null, currency: string): MoneyValue {
  return fromNumericString(amount, currency) ?? zeroMoney(currency);
}

export function sumMoneyAmounts(
  amounts: readonly (string | null)[],
  currency: string,
): MoneyValue {
  const values = amounts
    .map((amount) => fromNumericString(amount, currency))
    .filter((value): value is MoneyValue => value !== null);
  return roundMoney(sumMoney(values, currency));
}
