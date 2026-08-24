import type { CostPosition, CoveragePartial } from '@/modules/financials/domain/types';
import {
  addMoney,
  fromNumericString,
  isZeroMoney,
  roundMoney,
  sumMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { CostSourcePresence } from './coverage';
import { shouldExcludeLaborExpenseForWorkforce } from './labor-expense-integrity';

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
  /** Project the contribution lands on (direct or allocation target). */
  readonly projectId?: string | null;
  /** System category key `labor` - Mode B payroll/labor lump sum. */
  readonly isLaborCategory?: boolean;
  /** Source expense id - used to exclude bill-linked expenses from Actual. */
  readonly expenseId?: string | null;
  /** Optional mapping for per-line budget Actual. Never guessed when absent. */
  readonly categoryKey?: string | null;
  readonly workPackageId?: string | null;
  /** Optional vendor metadata for Owner Actual breakdown (engine ignores). */
  readonly vendorId?: string | null;
  readonly vendorName?: string | null;
  readonly vendorType?: string | null;
}

export interface LaborCostContribution {
  readonly laborCost: MoneyValue;
  readonly hasWorkforceData: boolean;
  readonly entriesMissingCost?: number;
  readonly excludedForeignCurrencyEntries?: number;
  /**
   * Org-scope: exclude labor-category expenses only for these project ids.
   * Project-scope: omit - any labor-category line is excluded when hasWorkforceData.
   */
  readonly projectIdsWithWorkforceLabor?: ReadonlySet<string>;
}

export interface AggregatedProjectCosts {
  readonly cost: CostPosition;
  readonly sources: readonly CostSourcePresence[];
  readonly partials: readonly CoveragePartial[];
}

export interface ForecastFinalCostInput {
  readonly actualCostToDate: MoneyValue;
  /** Remaining open / partially_consumed committed amounts (already net of consumption). */
  readonly remainingCommitments: MoneyValue;
  /** Uncovenanted ETC - must not duplicate PO commitments. */
  readonly expectedRemainingCost: MoneyValue;
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
 * Forecast Final Cost = Actual + Remaining Valid Commitments + Expected Remaining Cost.
 *
 * Actual includes finalized expenses and recognized (posted) vendor bills.
 * Commitments must already be remaining (post bill/PO consumption). Never add open AP
 * payable / vendor payments here - cash obligations only, not incremental cost.
 */
export function computeForecastFinalCost(input: ForecastFinalCostInput): MoneyValue {
  const currency = input.actualCostToDate.currency;
  if (input.remainingCommitments.currency !== currency) {
    throw new Error('Remaining commitments currency must match actual cost currency');
  }
  if (input.expectedRemainingCost.currency !== currency) {
    throw new Error('Expected remaining cost currency must match actual cost currency');
  }
  return roundMoney(
    sumMoney(
      [input.actualCostToDate, input.remainingCommitments, input.expectedRemainingCost],
      currency,
    ),
  );
}

/**
 * Aggregates every cost line that touches a project and derives coverage flags.
 *
 * Estimated final starts equal to actual; getProjectFinancials applies forecast
 * via remaining commitments + expected remaining cost.
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
  let excludedLaborCategoryForWorkforce = 0;
  let vendorActual = zeroMoney(currency);

  for (const line of contributions) {
    if (line.currency.toUpperCase() !== normalizedCurrency) {
      excludedForeignCurrencyExpenses += 1;
      continue;
    }

    if (
      shouldExcludeLaborExpenseForWorkforce({
        isLaborCategory: line.isLaborCategory ?? false,
        projectId: line.projectId ?? null,
        hasWorkforceData: labor?.hasWorkforceData ?? false,
        projectIdsWithWorkforceLabor: labor?.projectIdsWithWorkforceLabor,
      })
    ) {
      excludedLaborCategoryForWorkforce += 1;
      continue;
    }

    const amount = fromNumericString(line.amount, line.currency);
    if (!amount) continue;

    const family = familyKeyFromDb(line.costFamily);
    byFamily[family] = addMoney(byFamily[family]!, amount);

    if (line.isSubcontractor) {
      hasSubcontractorRows = true;
      vendorActual = addMoney(vendorActual, amount);
    }

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
  if (excludedLaborCategoryForWorkforce > 0) {
    partials.push({
      reason: 'labor_category_excluded_for_workforce',
      count: excludedLaborCategoryForWorkforce,
    });
  }

  const laborActual = labor?.hasWorkforceData ? roundMoney(labor.laborCost) : zeroMoney(currency);

  return {
    cost: {
      actualCostToDate,
      // Forecast applied later with commitments + ETC.
      estimatedFinalCost: actualCostToDate,
      byFamily: {
        directProject: roundMoney(byFamily.directProject),
        shared: roundMoney(byFamily.shared),
        businessOverhead: roundMoney(byFamily.businessOverhead),
        assetCapital: roundMoney(byFamily.assetCapital),
      },
      laborActual,
      vendorActual: roundMoney(vendorActual),
      overheadActual: roundMoney(byFamily.businessOverhead),
      committedOpen: zeroMoney(currency),
      expectedRemainingCost: zeroMoney(currency),
      openApPayable: zeroMoney(currency),
      monthCloseCostNet: zeroMoney(currency),
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
    laborActual: zero,
    vendorActual: zero,
    overheadActual: zero,
    committedOpen: zero,
    expectedRemainingCost: zero,
    openApPayable: zero,
    monthCloseCostNet: zero,
  };
}

/**
 * Fold recognized vendor bills into Actual / vendorActual (direct_project family).
 * Call after excluding expenses linked to those bills from expense aggregation.
 */
export function withRecognizedVendorBills(
  cost: CostPosition,
  recognizedVendorActual: MoneyValue,
): CostPosition {
  if (cost.actualCostToDate.currency !== recognizedVendorActual.currency) {
    throw new Error('Recognized vendor bill currency must match project cost currency');
  }
  if (isZeroMoney(recognizedVendorActual)) {
    return cost;
  }

  const actualCostToDate = roundMoney(addMoney(cost.actualCostToDate, recognizedVendorActual));
  const vendorActual = roundMoney(addMoney(cost.vendorActual, recognizedVendorActual));
  const directProject = roundMoney(
    addMoney(cost.byFamily.directProject, recognizedVendorActual),
  );

  return {
    ...cost,
    actualCostToDate,
    estimatedFinalCost: actualCostToDate,
    vendorActual,
    byFamily: {
      ...cost.byFamily,
      directProject,
    },
  };
}

/**
 * Attach Committed + ETC into Forecast Final Cost, and AP payable for cash disclosure.
 * Actual is unchanged here. Open AP / payments are never added into estimatedFinalCost.
 */
export function withCommittedAndApPayable(
  cost: CostPosition,
  committedOpen: MoneyValue,
  openApPayable: MoneyValue,
  expectedRemainingCost: MoneyValue = zeroMoney(cost.actualCostToDate.currency),
): CostPosition {
  if (cost.actualCostToDate.currency !== committedOpen.currency) {
    throw new Error('Committed currency must match project cost currency');
  }
  if (cost.actualCostToDate.currency !== openApPayable.currency) {
    throw new Error('AP payable currency must match project cost currency');
  }
  if (cost.actualCostToDate.currency !== expectedRemainingCost.currency) {
    throw new Error('Expected remaining currency must match project cost currency');
  }

  const remainingCommitments = roundMoney(committedOpen);
  const etc = roundMoney(expectedRemainingCost);
  const estimatedFinalCost = computeForecastFinalCost({
    actualCostToDate: cost.actualCostToDate,
    remainingCommitments,
    expectedRemainingCost: etc,
  });

  return {
    ...cost,
    committedOpen: remainingCommitments,
    expectedRemainingCost: etc,
    openApPayable: roundMoney(openApPayable),
    estimatedFinalCost,
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
