import type { BusinessDate } from '@/shared/dates';
import type { CostFamily } from '@/modules/expenses/domain/types';
import {
  addMoney,
  fromNumericString,
  isZeroMoney,
  money,
  roundMoney,
  subtractMoney,
  toNumericString,
  type MoneyValue,
  zeroMoney,
} from '@/shared/money';
import {
  formatPoolWeightPercent,
  informationalExpenseSharePercent,
  type ProjectAllocatedGeneralMonthSlice,
  uniformPoolWeight,
} from './allocated-general-percent-display';
import {
  resolveAllocationMethodKey,
  resolveAllocationMethodLabelHebrew,
} from './allocation-method-labels';

export type ProjectAllocatedGeneralSourceKind = 'expense' | 'pool_other';

export interface ProjectAllocatedGeneralDetailRow {
  readonly id: string;
  readonly sourceKind: ProjectAllocatedGeneralSourceKind;
  readonly expenseId: string | null;
  readonly expenseDate: BusinessDate | null;
  readonly supplierName: string | null;
  readonly description: string | null;
  readonly expenseGrossAmount: MoneyValue | null;
  readonly allocatedAmount: MoneyValue;
  readonly poolWeightPercent: string | null;
  readonly informationalPercent: string | null;
  readonly yearMonth: string | null;
  readonly allocationMethodKey: string | null;
  readonly allocationMethodLabel: string | null;
  readonly costFamily: CostFamily | null;
  readonly costCategoryKey: string | null;
  readonly sharedProjectCount: number | null;
  readonly monthSlices: readonly ProjectAllocatedGeneralMonthSlice[] | null;
}

export interface ProjectAllocatedGeneralDetail {
  readonly currency: string;
  readonly totalAllocated: MoneyValue;
  readonly rows: readonly ProjectAllocatedGeneralDetailRow[];
  readonly detailSumDifference: MoneyValue;
  readonly reconciles: boolean;
}

export interface RawProjectAllocatedGeneralAttributionRow {
  readonly generalCostMonthId: string;
  readonly yearMonth: string;
  readonly projectAllocatedAmount: string;
  readonly projectWeightPercent: string | null;
  readonly poolAmount: string;
  readonly basisMode: string | null;
  readonly sourceKind: string | null;
  readonly sourceId: string | null;
  readonly sourceLabel: string | null;
  readonly sourcePoolAmount: string | null;
  readonly expenseDate: string | null;
  readonly description: string | null;
  readonly recurringSourceTitle: string | null;
  readonly supplierName: string | null;
  readonly expenseGrossAmount: string | null;
  readonly expenseCostFamily: string | null;
  readonly costCategoryKey: string | null;
  readonly expenseAllocationDriverMethod: string | null;
  readonly categoryDefaultAllocationMethod: string | null;
  readonly monthProjectCount: number | null;
  readonly currency: string;
}

function proportionalShare(
  sourceAmount: string,
  poolAmount: string,
  projectShare: string,
  currency: string,
): MoneyValue {
  const source = fromNumericString(sourceAmount, currency);
  const pool = fromNumericString(poolAmount, currency);
  const project = fromNumericString(projectShare, currency);
  if (!source || !pool || !project || isZeroMoney(pool)) {
    return zeroMoney(currency);
  }
  const ratio = Number(source.amount) / Number(pool.amount);
  const allocated = Number(project.amount) * ratio;
  return roundMoney(money(String(allocated), currency));
}

function resolveExpenseDescription(row: RawProjectAllocatedGeneralAttributionRow): string | null {
  const trimmed = row.description?.trim();
  if (trimmed) return trimmed;
  const recurring = row.recurringSourceTitle?.trim();
  if (recurring) return recurring;
  return row.sourceLabel?.trim() ?? null;
}

function buildMethodFields(row: RawProjectAllocatedGeneralAttributionRow): {
  allocationMethodKey: string | null;
  allocationMethodLabel: string | null;
} {
  const key = resolveAllocationMethodKey(
    row.expenseAllocationDriverMethod,
    row.basisMode,
    row.categoryDefaultAllocationMethod,
  );
  return {
    allocationMethodKey: key,
    allocationMethodLabel: resolveAllocationMethodLabelHebrew(key) ?? key,
  };
}

function buildDetailRow(
  input: Omit<ProjectAllocatedGeneralDetailRow, 'informationalPercent' | 'monthSlices'> & {
    readonly monthSlices?: readonly ProjectAllocatedGeneralMonthSlice[] | null;
  },
): ProjectAllocatedGeneralDetailRow {
  const informationalPercent =
    input.allocationMethodKey === 'manual_amount'
      ? informationalExpenseSharePercent(input.allocatedAmount, input.expenseGrossAmount)
      : null;
  return {
    ...input,
    informationalPercent,
    monthSlices: input.monthSlices ?? null,
  };
}

function groupExpenseRowsForDisplay(
  rows: ProjectAllocatedGeneralDetailRow[],
): ProjectAllocatedGeneralDetailRow[] {
  const poolOther = rows.filter((row) => row.sourceKind === 'pool_other');
  const byExpense = new Map<string, ProjectAllocatedGeneralDetailRow[]>();

  for (const row of rows) {
    if (row.sourceKind !== 'expense' || !row.expenseId) continue;
    const list = byExpense.get(row.expenseId) ?? [];
    list.push(row);
    byExpense.set(row.expenseId, list);
  }

  const grouped: ProjectAllocatedGeneralDetailRow[] = [];
  for (const [expenseId, slices] of byExpense) {
    if (slices.length === 1) {
      grouped.push(slices[0]!);
      continue;
    }
    slices.sort((a, b) => (a.yearMonth ?? '').localeCompare(b.yearMonth ?? ''));
    let total = zeroMoney(slices[0]!.allocatedAmount.currency);
    for (const slice of slices) {
      total = addMoney(total, slice.allocatedAmount);
    }
    total = roundMoney(total);
    const monthSlices: ProjectAllocatedGeneralMonthSlice[] = slices.map((slice) => ({
      yearMonth: slice.yearMonth!,
      allocatedAmount: slice.allocatedAmount,
      poolWeightPercent: slice.poolWeightPercent,
    }));
    grouped.push(
      buildDetailRow({
        ...slices[0]!,
        id: expenseId,
        allocatedAmount: total,
        poolWeightPercent: uniformPoolWeight(monthSlices),
        monthSlices,
        yearMonth: null,
      }),
    );
  }

  grouped.sort((a, b) =>
    (b.expenseDate ?? b.yearMonth ?? '').localeCompare(a.expenseDate ?? a.yearMonth ?? ''),
  );
  return [...grouped, ...poolOther];
}

export function buildProjectAllocatedGeneralDetail(input: {
  readonly expectedTotal: MoneyValue;
  readonly rawRows: readonly RawProjectAllocatedGeneralAttributionRow[];
}): ProjectAllocatedGeneralDetail {
  const currency = input.expectedTotal.currency.toUpperCase();
  const months = new Map<
    string,
    {
      projectAllocatedAmount: string;
      projectWeightPercent: string | null;
      poolAmount: string;
      basisMode: string | null;
      expenseSources: RawProjectAllocatedGeneralAttributionRow[];
      otherSources: RawProjectAllocatedGeneralAttributionRow[];
    }
  >();

  for (const row of input.rawRows) {
    const bucket = months.get(row.yearMonth) ?? {
      projectAllocatedAmount: row.projectAllocatedAmount,
      projectWeightPercent: row.projectWeightPercent,
      poolAmount: row.poolAmount,
      basisMode: row.basisMode,
      expenseSources: [],
      otherSources: [],
    };
    if (row.sourceKind === 'expense_unallocated' && row.sourceId) {
      bucket.expenseSources.push(row);
    } else if (row.sourceKind) {
      bucket.otherSources.push(row);
    }
    months.set(row.yearMonth, bucket);
  }

  const rows: ProjectAllocatedGeneralDetailRow[] = [];

  for (const [yearMonth, bucket] of months) {
    const projectShare = fromNumericString(bucket.projectAllocatedAmount, currency);
    if (!projectShare || isZeroMoney(projectShare)) continue;
    const poolWeight = formatPoolWeightPercent(bucket.projectWeightPercent);

    const expenseById = new Map<string, ProjectAllocatedGeneralDetailRow>();
    for (const row of bucket.expenseSources) {
      const sourceAmount = row.sourcePoolAmount ?? row.poolAmount;
      const allocated = proportionalShare(
        sourceAmount,
        row.poolAmount,
        row.projectAllocatedAmount,
        currency,
      );
      if (isZeroMoney(allocated)) continue;
      const expenseGross = row.expenseGrossAmount
        ? fromNumericString(row.expenseGrossAmount, currency)
        : null;
      const methodFields = buildMethodFields(row);
      const weight = formatPoolWeightPercent(row.projectWeightPercent) ?? poolWeight;
      const existing = expenseById.get(row.sourceId!);
      if (existing) {
        const merged = roundMoney(addMoney(existing.allocatedAmount, allocated));
        expenseById.set(
          row.sourceId!,
          buildDetailRow({
            ...existing,
            allocatedAmount: merged,
          }),
        );
      } else {
        expenseById.set(
          row.sourceId!,
          buildDetailRow({
            id: `${yearMonth}:${row.sourceId}`,
            sourceKind: 'expense',
            expenseId: row.sourceId,
            expenseDate: (row.expenseDate as BusinessDate | null) ?? null,
            supplierName: row.supplierName,
            description: resolveExpenseDescription(row),
            expenseGrossAmount: expenseGross,
            allocatedAmount: allocated,
            poolWeightPercent: weight,
            yearMonth,
            allocationMethodKey: methodFields.allocationMethodKey,
            allocationMethodLabel: methodFields.allocationMethodLabel,
            costFamily: (row.expenseCostFamily as CostFamily | null) ?? null,
            costCategoryKey: row.costCategoryKey,
            sharedProjectCount: row.monthProjectCount,
          }),
        );
      }
    }

    rows.push(...expenseById.values());

    for (const row of bucket.otherSources) {
      const sourceAmount = row.sourcePoolAmount ?? row.poolAmount;
      const allocated = proportionalShare(
        sourceAmount,
        row.poolAmount,
        row.projectAllocatedAmount,
        currency,
      );
      if (isZeroMoney(allocated)) continue;
      const methodFields = buildMethodFields(row);
      const poolGross = fromNumericString(sourceAmount, currency);
      rows.push(
        buildDetailRow({
          id: `${yearMonth}:${row.sourceKind}:${sourceAmount}`,
          sourceKind: 'pool_other',
          expenseId: null,
          expenseDate: null,
          supplierName: null,
          description: resolveExpenseDescription(row) ?? row.sourceLabel ?? row.sourceKind,
          expenseGrossAmount: poolGross,
          allocatedAmount: allocated,
          poolWeightPercent: poolWeight,
          yearMonth,
          allocationMethodKey: methodFields.allocationMethodKey,
          allocationMethodLabel: methodFields.allocationMethodLabel,
          costFamily: null,
          costCategoryKey: null,
          sharedProjectCount: row.monthProjectCount,
        }),
      );
    }

    let attributed = zeroMoney(currency);
    for (const expenseRow of expenseById.values()) {
      attributed = addMoney(attributed, expenseRow.allocatedAmount);
    }
    for (const row of bucket.otherSources) {
      const sourceAmount = row.sourcePoolAmount ?? row.poolAmount;
      const allocated = proportionalShare(
        sourceAmount,
        row.poolAmount,
        row.projectAllocatedAmount,
        currency,
      );
      if (!isZeroMoney(allocated)) {
        attributed = addMoney(attributed, allocated);
      }
    }
    attributed = roundMoney(attributed);

    const remainder = roundMoney(subtractMoney(projectShare, attributed));
    const sampleRow = bucket.otherSources[0] ?? bucket.expenseSources[0];
    if (!isZeroMoney(remainder)) {
      const methodFields = buildMethodFields({
        ...(sampleRow ?? {}),
        basisMode: bucket.basisMode,
        expenseAllocationDriverMethod: null,
        categoryDefaultAllocationMethod: null,
      } as RawProjectAllocatedGeneralAttributionRow);
      rows.push(
        buildDetailRow({
          id: `${yearMonth}:pool_other`,
          sourceKind: 'pool_other',
          expenseId: null,
          expenseDate: null,
          supplierName: null,
          description:
            bucket.otherSources[0]?.sourceLabel ??
            bucket.otherSources[0]?.sourceKind ??
            yearMonth,
          expenseGrossAmount: fromNumericString(bucket.poolAmount, currency),
          allocatedAmount: remainder,
          poolWeightPercent: poolWeight,
          yearMonth,
          allocationMethodKey: methodFields.allocationMethodKey,
          allocationMethodLabel: methodFields.allocationMethodLabel,
          costFamily: null,
          costCategoryKey: null,
          sharedProjectCount: sampleRow?.monthProjectCount ?? null,
        }),
      );
    } else if (expenseById.size === 0 && bucket.otherSources.length === 0) {
      const methodFields = buildMethodFields({
        basisMode: bucket.basisMode,
        expenseAllocationDriverMethod: null,
        categoryDefaultAllocationMethod: null,
      } as RawProjectAllocatedGeneralAttributionRow);
      rows.push(
        buildDetailRow({
          id: `${yearMonth}:pool_month`,
          sourceKind: 'pool_other',
          expenseId: null,
          expenseDate: null,
          supplierName: null,
          description: yearMonth,
          expenseGrossAmount: fromNumericString(bucket.poolAmount, currency),
          allocatedAmount: projectShare,
          poolWeightPercent: poolWeight,
          yearMonth,
          allocationMethodKey: methodFields.allocationMethodKey,
          allocationMethodLabel: methodFields.allocationMethodLabel,
          costFamily: null,
          costCategoryKey: null,
          sharedProjectCount: sampleRow?.monthProjectCount ?? null,
        }),
      );
    }
  }

  const displayRows = groupExpenseRowsForDisplay(rows);

  let detailSum = zeroMoney(currency);
  for (const row of displayRows) {
    detailSum = addMoney(detailSum, row.allocatedAmount);
  }
  detailSum = roundMoney(detailSum);

  const detailSumDifference = roundMoney(subtractMoney(input.expectedTotal, detailSum));
  const reconciles =
    isZeroMoney(detailSumDifference) ||
    Math.abs(Number(detailSumDifference.amount)) <= 0.01;

  return {
    currency,
    totalAllocated: roundMoney(input.expectedTotal),
    rows: displayRows,
    detailSumDifference,
    reconciles,
  };
}

export function formatAllocatedGeneralDetailSum(amount: MoneyValue): string {
  return toNumericString(roundMoney(amount));
}
