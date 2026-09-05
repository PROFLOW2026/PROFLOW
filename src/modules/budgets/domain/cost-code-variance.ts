import type { MoneyValue } from '@/shared/money/money';
import {
  addMoney,
  fromNumericString,
  roundMoney,
  subtractMoney,
  sumMoney,
  zeroMoney,
} from '@/shared/money/money';

/** Slice of amount attributed to a catalog cost code (not Cost Category). */
export interface CostCodeAmountSlice {
  readonly costCodeId: string;
  readonly amount: string;
  readonly currency: string;
}

export interface CostCodeCatalogLabel {
  readonly key: string;
  readonly name: string;
}

export interface CostCodeVarianceRow {
  readonly costCodeId: string;
  readonly costCodeKey: string | null;
  readonly costCodeName: string;
  readonly budget: MoneyValue;
  readonly committed: MoneyValue;
  readonly actual: MoneyValue;
  /** Budget − Actual (positive = under budget). */
  readonly varianceBudgetVsActual: MoneyValue;
  /** Budget − Committed (positive = headroom before spend). */
  readonly varianceBudgetVsCommitted: MoneyValue;
}

export interface CostCodeVarianceResult {
  readonly currency: string;
  readonly rows: readonly CostCodeVarianceRow[];
  readonly unattributedActual: MoneyValue;
  readonly hasCostCodeAttribution: boolean;
}

function sumSlicesByCostCode(
  slices: readonly CostCodeAmountSlice[],
  currency: string,
): { readonly byCode: Map<string, MoneyValue>; readonly excludedActual: MoneyValue } {
  const normalized = currency.toUpperCase();
  const buckets = new Map<string, MoneyValue[]>();
  const excluded: MoneyValue[] = [];
  for (const slice of slices) {
    if (slice.currency.toUpperCase() !== normalized) {
      const asProjectCurrency = fromNumericString(slice.amount, normalized);
      if (asProjectCurrency) excluded.push(asProjectCurrency);
      continue;
    }
    const amount = fromNumericString(slice.amount, slice.currency);
    if (!amount) continue;
    const list = buckets.get(slice.costCodeId) ?? [];
    list.push(amount);
    buckets.set(slice.costCodeId, list);
  }
  const byCode = new Map<string, MoneyValue>();
  for (const [costCodeId, values] of buckets) {
    byCode.set(costCodeId, values.length === 0 ? zeroMoney(normalized) : roundMoney(sumMoney(values, normalized)));
  }
  return {
    byCode,
    excludedActual:
      excluded.length === 0 ? zeroMoney(normalized) : roundMoney(sumMoney(excluded, normalized)),
  };
}

/**
 * Compose Budget vs Committed vs Actual by catalog cost code.
 * Cost Category (expense_allocations.cost_category_id) is intentionally excluded —
 * this view is cost-code attribution only.
 */
export function composeCostCodeVariance(input: {
  readonly currency: string;
  readonly budgetSlices: readonly CostCodeAmountSlice[];
  readonly committedSlices: readonly CostCodeAmountSlice[];
  readonly actualSlices: readonly CostCodeAmountSlice[];
  readonly catalogLabels: ReadonlyMap<string, CostCodeCatalogLabel>;
  readonly unattributedActualAmount?: string | null;
}): CostCodeVarianceResult {
  const currency = input.currency.toUpperCase();
  const { byCode: budgetByCode } = sumSlicesByCostCode(input.budgetSlices, currency);
  const { byCode: committedByCode } = sumSlicesByCostCode(input.committedSlices, currency);
  const { byCode: actualByCode, excludedActual } = sumSlicesByCostCode(
    input.actualSlices,
    currency,
  );

  const costCodeIds = new Set<string>([
    ...budgetByCode.keys(),
    ...committedByCode.keys(),
    ...actualByCode.keys(),
  ]);

  const zero = zeroMoney(currency);
  const rows: CostCodeVarianceRow[] = [...costCodeIds]
    .map((costCodeId) => {
      const label = input.catalogLabels.get(costCodeId);
      const budget = budgetByCode.get(costCodeId) ?? zero;
      const committed = committedByCode.get(costCodeId) ?? zero;
      const actual = actualByCode.get(costCodeId) ?? zero;
      return {
        costCodeId,
        costCodeKey: label?.key ?? null,
        costCodeName: label?.name ?? costCodeId.slice(0, 8),
        budget,
        committed,
        actual,
        varianceBudgetVsActual: subtractMoney(budget, actual),
        varianceBudgetVsCommitted: subtractMoney(budget, committed),
      };
    })
    .sort((a, b) => a.costCodeName.localeCompare(b.costCodeName));

  const unattributedBase =
    fromNumericString(input.unattributedActualAmount ?? '0', currency) ?? zero;
  const unattributed = addMoney(unattributedBase, excludedActual);

  return {
    currency,
    rows,
    unattributedActual: unattributed,
    hasCostCodeAttribution: rows.length > 0 || unattributed.amount !== '0',
  };
}

/** Roll up slice totals for KPI headers. */
export function sumCostCodeVarianceTotals(rows: readonly CostCodeVarianceRow[], currency: string) {
  const zero = zeroMoney(currency);
  return rows.reduce(
    (acc, row) => ({
      budget: addMoney(acc.budget, row.budget),
      committed: addMoney(acc.committed, row.committed),
      actual: addMoney(acc.actual, row.actual),
    }),
    { budget: zero, committed: zero, actual: zero },
  );
}
