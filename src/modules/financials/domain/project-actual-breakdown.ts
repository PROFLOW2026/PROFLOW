import {
  addMoney,
  compareMoney,
  fromNumericString,
  isZeroMoney,
  money,
  roundMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { DbCostFamily } from './cost-aggregation';
import { isLaborCostCategoryKey } from './labor-expense-integrity';

/**
 * Owner-facing exclusive partition of canonical Project Actual.
 * Display classification only — not a second financial engine.
 */
export type ProjectActualBreakdownCategoryKey =
  | 'employees'
  | 'subcontractors'
  | 'vendors'
  | 'materials'
  | 'otherExpenses'
  | 'overhead';

export const PROJECT_ACTUAL_BREAKDOWN_CATEGORY_ORDER = [
  'employees',
  'subcontractors',
  'vendors',
  'materials',
  'otherExpenses',
  'overhead',
] as const satisfies readonly ProjectActualBreakdownCategoryKey[];

export type ActualAtomSourceKind = 'labor' | 'expense' | 'ap_bill' | 'month_close';

/**
 * One recognized Actual slice before exclusive classification.
 * Amounts must already match compose (post Expense/AP dedup, post credits).
 */
export interface ProjectActualAtom {
  readonly amount: MoneyValue;
  readonly sourceKind: ActualAtomSourceKind;
  readonly sourceId: string;
  readonly label?: string | null;
  readonly costFamily?: DbCostFamily | null;
  readonly categoryKey?: string | null;
  readonly vendorId?: string | null;
  readonly vendorName?: string | null;
  /** Vendor.type: supplier | subcontractor | both | other */
  readonly vendorType?: string | null;
  /** AP / OCR only — reliable subcontract attribution when set. */
  readonly subcontractAgreementId?: string | null;
  readonly isLaborCategory?: boolean;
  readonly hasWorkforceLaborOnProject?: boolean;
}

export interface ProjectActualBreakdownCategory {
  readonly key: ProjectActualBreakdownCategoryKey;
  readonly amount: MoneyValue;
  readonly percentOfActual: string | null;
  readonly sourceCount: number;
  readonly availability: 'value' | 'unavailable' | 'partial';
  readonly atoms: readonly ProjectActualAtom[];
}

export interface ProjectActualBreakdown {
  readonly currency: string;
  readonly totalActual: MoneyValue;
  readonly categories: readonly ProjectActualBreakdownCategory[];
  readonly differenceFromActual: MoneyValue;
  readonly reconciles: boolean;
}

/** Deterministic material keys — no vendor-name guessing. */
export function isMaterialCostCategoryKey(key: string | null | undefined): boolean {
  if (!key) return false;
  const normalized = key.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'materials') return true;
  if (normalized.startsWith('materials_')) return true;
  if (normalized.endsWith('_materials')) return true;
  // Profile seeds: building_materials, install_materials, electrical_materials, …
  if (normalized.includes('materials')) return true;
  return false;
}

export function isSubcontractorCategoryKey(key: string | null | undefined): boolean {
  if (!key) return false;
  const normalized = key.trim().toLowerCase();
  return normalized === 'subcontractor' || normalized.startsWith('subcontractor_');
}

/**
 * Reliable subcontract Actual attribution (Owner lock):
 * - AP/OCR atom with subcontractAgreementId, OR
 * - categoryKey subcontract, OR
 * - vendor.type === 'subcontractor' (strict; `both` alone is NOT enough).
 */
export function isReliableSubcontractorAtom(atom: ProjectActualAtom): boolean {
  if (atom.subcontractAgreementId) return true;
  if (isSubcontractorCategoryKey(atom.categoryKey)) return true;
  if ((atom.vendorType ?? '').toLowerCase() === 'subcontractor') return true;
  return false;
}

export function classifyActualAtom(
  atom: ProjectActualAtom,
): ProjectActualBreakdownCategoryKey {
  if (atom.sourceKind === 'labor') return 'employees';

  if (atom.sourceKind === 'month_close') return 'otherExpenses';

  // Labor-category expenses excluded from Actual when workforce feeds labor —
  // those atoms should not be passed in. If they are, exclude from buckets via other.
  if (
    atom.isLaborCategory &&
    atom.hasWorkforceLaborOnProject &&
    isLaborCostCategoryKey(atom.categoryKey)
  ) {
    return 'otherExpenses';
  }

  if (atom.costFamily === 'business_overhead') return 'overhead';

  if (isMaterialCostCategoryKey(atom.categoryKey)) return 'materials';

  if (isReliableSubcontractorAtom(atom)) return 'subcontractors';

  if (atom.vendorId) return 'vendors';

  return 'otherExpenses';
}

function percentOf(part: MoneyValue, whole: MoneyValue): string | null {
  if (isZeroMoney(whole)) return null;
  const p = Number(part.amount);
  const w = Number(whole.amount);
  if (!Number.isFinite(p) || !Number.isFinite(w) || w === 0) return null;
  return ((p / w) * 100).toFixed(1);
}

const MAX_ROUNDING_RESIDUAL = money('0.01', 'ILS');

/**
 * Build exclusive Owner breakdown. Folds |delta| ≤ 0.01 into Other.
 * Larger deltas → reconciles=false (must not ship).
 */
export function buildProjectActualBreakdown(input: {
  readonly totalActual: MoneyValue;
  readonly atoms: readonly ProjectActualAtom[];
  readonly employeesAvailability?: 'value' | 'unavailable' | 'partial';
}): ProjectActualBreakdown {
  const currency = input.totalActual.currency.toUpperCase();
  const buckets = new Map<
    ProjectActualBreakdownCategoryKey,
    { total: MoneyValue; atoms: ProjectActualAtom[] }
  >();

  for (const key of PROJECT_ACTUAL_BREAKDOWN_CATEGORY_ORDER) {
    buckets.set(key, { total: zeroMoney(currency), atoms: [] });
  }

  for (const atom of input.atoms) {
    if (atom.amount.currency.toUpperCase() !== currency) continue;
    if (isZeroMoney(atom.amount)) continue;
    const key = classifyActualAtom(atom);
    const bucket = buckets.get(key)!;
    bucket.total = addMoney(bucket.total, atom.amount);
    bucket.atoms.push(atom);
  }

  let breakdownSum = zeroMoney(currency);
  for (const key of PROJECT_ACTUAL_BREAKDOWN_CATEGORY_ORDER) {
    const bucket = buckets.get(key)!;
    bucket.total = roundMoney(bucket.total);
    breakdownSum = addMoney(breakdownSum, bucket.total);
  }
  breakdownSum = roundMoney(breakdownSum);

  const rawDiff = subtractMoney(input.totalActual, breakdownSum);
  const absDiffAmount = Math.abs(Number(rawDiff.amount));
  const maxResidual = Number(MAX_ROUNDING_RESIDUAL.amount);

  if (absDiffAmount > 0 && absDiffAmount <= maxResidual + 1e-9) {
    const other = buckets.get('otherExpenses')!;
    other.total = roundMoney(addMoney(other.total, rawDiff));
    breakdownSum = roundMoney(addMoney(breakdownSum, rawDiff));
  }

  const differenceFromActual = roundMoney(subtractMoney(input.totalActual, breakdownSum));
  const reconciles = isZeroMoney(differenceFromActual);

  const categories: ProjectActualBreakdownCategory[] = PROJECT_ACTUAL_BREAKDOWN_CATEGORY_ORDER.map(
    (key) => {
      const bucket = buckets.get(key)!;
      let availability: 'value' | 'unavailable' | 'partial' = 'value';
      if (key === 'employees') {
        availability = input.employeesAvailability ?? 'value';
      }
      return {
        key,
        amount: bucket.total,
        percentOfActual: percentOf(bucket.total, input.totalActual),
        sourceCount: bucket.atoms.length,
        availability,
        atoms: bucket.atoms,
      };
    },
  );

  return {
    currency,
    totalActual: roundMoney(input.totalActual),
    categories,
    differenceFromActual,
    reconciles,
  };
}

export function assertBreakdownReconciles(breakdown: ProjectActualBreakdown): void {
  if (!breakdown.reconciles) {
    throw new Error(
      `Project Actual breakdown does not reconcile: diff=${breakdown.differenceFromActual.amount} ${breakdown.differenceFromActual.currency}`,
    );
  }
}

export function categoryAmount(
  breakdown: ProjectActualBreakdown,
  key: ProjectActualBreakdownCategoryKey,
): MoneyValue {
  return (
    breakdown.categories.find((row) => row.key === key)?.amount ??
    zeroMoney(breakdown.currency)
  );
}

/** Compare for tests — absolute difference in major units. */
export function absoluteMoneyDiff(a: MoneyValue, b: MoneyValue): number {
  if (a.currency.toUpperCase() !== b.currency.toUpperCase()) {
    throw new Error('currency mismatch');
  }
  return Math.abs(Number(subtractMoney(a, b).amount));
}

export function moneyCompareEqual(a: MoneyValue, b: MoneyValue): boolean {
  return compareMoney(a, b) === 0;
}

export function parseAtomAmount(amount: string, currency: string): MoneyValue | null {
  return fromNumericString(amount, currency);
}

export function countClassificationOverlaps(atoms: readonly ProjectActualAtom[]): {
  readonly expenseApDuplicateSourceIds: number;
  readonly vendorAndSubcontractor: number;
  readonly vendorAndMaterial: number;
  readonly laborAndExpenseCategory: number;
} {
  const expenseIds = new Set<string>();
  let expenseApDuplicateSourceIds = 0;
  let vendorAndSubcontractor = 0;
  let vendorAndMaterial = 0;
  let laborAndExpenseCategory = 0;

  for (const atom of atoms) {
    if (atom.sourceKind === 'expense' && atom.sourceId) {
      if (expenseIds.has(atom.sourceId)) expenseApDuplicateSourceIds += 1;
      expenseIds.add(atom.sourceId);
    }
    if (atom.sourceKind === 'ap_bill' && atom.sourceId) {
      if (expenseIds.has(atom.sourceId)) expenseApDuplicateSourceIds += 1;
    }

    const classified = classifyActualAtom(atom);
    const wouldBeSub = isReliableSubcontractorAtom(atom);
    const wouldBeMaterial = isMaterialCostCategoryKey(atom.categoryKey);

    if (classified === 'vendors' && wouldBeSub) vendorAndSubcontractor += 1;
    if (classified === 'vendors' && wouldBeMaterial) vendorAndMaterial += 1;
    if (classified !== 'employees' && atom.sourceKind === 'labor') laborAndExpenseCategory += 1;
    if (classified === 'employees' && atom.sourceKind !== 'labor') laborAndExpenseCategory += 1;
  }

  return {
    expenseApDuplicateSourceIds,
    vendorAndSubcontractor,
    vendorAndMaterial,
    laborAndExpenseCategory,
  };
}
