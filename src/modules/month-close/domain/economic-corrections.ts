import {
  addMoney,
  fromNumericString,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { MonthCloseAdjustment, MonthCloseEffectSide } from './types';

/**
 * Economic month-close rows are explicit money. Audit-only rows leave amount null.
 * Netting matches the compose loader: a row is dropped when another row's
 * `supersedesAdjustmentId` points at it. Surviving amounts fold into compose once.
 */
export interface EconomicAdjustmentLike {
  readonly id: string;
  readonly amount: string | null;
  readonly currency: string | null;
  readonly effectSide: MonthCloseEffectSide | null;
  readonly projectId: string | null;
  readonly supersedesAdjustmentId: string | null;
}

export function isEconomicAdjustment(row: EconomicAdjustmentLike): boolean {
  return (
    row.amount != null &&
    row.currency != null &&
    row.effectSide != null &&
    row.projectId != null
  );
}

export function supersededAdjustmentIds(
  rows: readonly EconomicAdjustmentLike[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.supersedesAdjustmentId) ids.add(row.supersedesAdjustmentId);
  }
  return ids;
}

export function isAdjustmentSuperseded(
  adjustmentId: string,
  rows: readonly EconomicAdjustmentLike[],
): boolean {
  return supersededAdjustmentIds(rows).has(adjustmentId);
}

export function netEconomicAdjustments(
  rows: readonly EconomicAdjustmentLike[],
  options: { readonly currency: string; readonly projectId?: string },
): { readonly costNet: MoneyValue; readonly revenueNet: MoneyValue } {
  const { currency } = options;
  const superseded = supersededAdjustmentIds(rows);
  let costNet = zeroMoney(currency);
  let revenueNet = zeroMoney(currency);

  for (const row of rows) {
    if (!isEconomicAdjustment(row)) continue;
    if (superseded.has(row.id)) continue;
    if (options.projectId && row.projectId !== options.projectId) continue;
    if (row.currency !== currency) continue;
    const money = fromNumericString(row.amount, currency);
    if (!money) continue;
    if (row.effectSide === 'cost') {
      costNet = addMoney(costNet, money);
    } else if (row.effectSide === 'revenue') {
      revenueNet = addMoney(revenueNet, money);
    }
  }

  return { costNet, revenueNet };
}

export interface MonthCloseAdjustmentExplanation {
  readonly adjustment: MonthCloseAdjustment;
  readonly isEconomic: boolean;
  readonly isSuperseded: boolean;
  /** Amount of the row this correction replaces, when this row supersedes one. */
  readonly originalAmount: MoneyValue | null;
  /** This row's amount (null for audit-only). */
  readonly correctionAmount: MoneyValue | null;
  /**
   * Surviving amount in compose for this row.
   * Null when the row is audit-only or has been superseded (historical journal only).
   */
  readonly currentEconomicAmount: MoneyValue | null;
}

function moneyFromRow(row: EconomicAdjustmentLike): MoneyValue | null {
  if (!row.amount || !row.currency) return null;
  return fromNumericString(row.amount, row.currency);
}

/**
 * Panel explainability only — does not compute project Actual.
 * Financial totals come from compose, which nets the same surviving rows.
 */
export function explainMonthCloseAdjustments(
  rows: readonly MonthCloseAdjustment[],
): MonthCloseAdjustmentExplanation[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const superseded = supersededAdjustmentIds(rows);

  return rows.map((adjustment) => {
    const original = adjustment.supersedesAdjustmentId
      ? byId.get(adjustment.supersedesAdjustmentId)
      : undefined;
    const isEconomic = isEconomicAdjustment(adjustment);
    const isSuperseded = superseded.has(adjustment.id);
    const correctionAmount = moneyFromRow(adjustment);
    return {
      adjustment,
      isEconomic,
      isSuperseded,
      originalAmount: original ? moneyFromRow(original) : null,
      correctionAmount,
      currentEconomicAmount: isEconomic && !isSuperseded ? correctionAmount : null,
    };
  });
}
