import type { BusinessDate } from '@/shared/dates';
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
  readonly allocationPercent: string | null;
  readonly yearMonth: string | null;
  readonly allocationMethodLabel: string | null;
}

export interface ProjectAllocatedGeneralDetail {
  readonly currency: string;
  readonly totalAllocated: MoneyValue;
  readonly rows: readonly ProjectAllocatedGeneralDetailRow[];
  readonly detailSumDifference: MoneyValue;
  readonly reconciles: boolean;
}

export interface RawProjectAllocatedGeneralAttributionRow {
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
  readonly supplierName: string | null;
  readonly expenseGrossAmount: string | null;
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

function percentOfAllocated(allocated: MoneyValue, expenseGross: MoneyValue | null): string | null {
  if (!expenseGross || isZeroMoney(expenseGross)) return null;
  const pct = (Number(allocated.amount) / Number(expenseGross.amount)) * 100;
  if (!Number.isFinite(pct)) return null;
  return pct.toFixed(1);
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
      const existing = expenseById.get(row.sourceId!);
      if (existing) {
        const merged = roundMoney(addMoney(existing.allocatedAmount, allocated));
        expenseById.set(row.sourceId!, {
          ...existing,
          allocatedAmount: merged,
          allocationPercent: percentOfAllocated(merged, expenseGross),
        });
      } else {
        expenseById.set(row.sourceId!, {
          id: `${yearMonth}:${row.sourceId}`,
          sourceKind: 'expense',
          expenseId: row.sourceId,
          expenseDate: (row.expenseDate as BusinessDate | null) ?? null,
          supplierName: row.supplierName,
          description: row.description,
          expenseGrossAmount: expenseGross,
          allocatedAmount: allocated,
          allocationPercent: percentOfAllocated(allocated, expenseGross),
          yearMonth,
          allocationMethodLabel: row.basisMode,
        });
      }
    }

    rows.push(...expenseById.values());

    let attributed = zeroMoney(currency);
    for (const expenseRow of expenseById.values()) {
      attributed = addMoney(attributed, expenseRow.allocatedAmount);
    }
    attributed = roundMoney(attributed);

    const remainder = roundMoney(subtractMoney(projectShare, attributed));
    if (!isZeroMoney(remainder)) {
      rows.push({
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
        allocationPercent: bucket.projectWeightPercent,
        yearMonth,
        allocationMethodLabel: bucket.basisMode,
      });
    } else if (expenseById.size === 0) {
      rows.push({
        id: `${yearMonth}:pool_month`,
        sourceKind: 'pool_other',
        expenseId: null,
        expenseDate: null,
        supplierName: null,
        description: yearMonth,
        expenseGrossAmount: fromNumericString(bucket.poolAmount, currency),
        allocatedAmount: projectShare,
        allocationPercent: bucket.projectWeightPercent,
        yearMonth,
        allocationMethodLabel: bucket.basisMode,
      });
    }
  }

  rows.sort((a, b) => (b.expenseDate ?? b.yearMonth ?? '').localeCompare(a.expenseDate ?? a.yearMonth ?? ''));

  let detailSum = zeroMoney(currency);
  for (const row of rows) {
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
    rows,
    detailSumDifference,
    reconciles,
  };
}

export function formatAllocatedGeneralDetailSum(amount: MoneyValue): string {
  return toNumericString(roundMoney(amount));
}
