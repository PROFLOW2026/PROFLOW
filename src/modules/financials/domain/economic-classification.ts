/**
 * Canonical economic classification registry for Owner Actual breakdown.
 *
 * Structured fields only — NEVER read description / notes / supplierName.
 * No substring `.includes('materials')` heuristics that can match unrelated keys.
 */

import type { DbCostFamily } from './cost-aggregation';
import {
  addMoney,
  money,
  roundMoney,
  type MoneyValue,
  zeroMoney,
} from '@/shared/money';
import {
  INTERNAL_EMPLOYEE_PAYROLL_CATEGORY_KEY,
  isInternalEmployeePayrollCategoryKey,
} from './labor-expense-integrity';

export type OwnerBreakdownBucket =
  | 'employees'
  | 'subcontractors'
  | 'vendors'
  | 'materials'
  | 'otherExpenses'
  | 'overhead';

export type ExpenseClassificationStatus = 'classified' | 'needs_classification';

/**
 * Exact material keys from org defaults + business-profiles.ts materials_* /
 * install_materials seeds. Prefix `materials_*` also matches via
 * {@link isMaterialEconomicCategoryKey}.
 */
const MATERIAL_EXACT_KEYS = new Set<string>([
  'materials',
  'building_materials',
  'install_materials',
  'electrical_materials',
  'materials_gc',
  'materials_reno',
  'materials_plumbing',
  'materials_sub',
  'materials_small',
  'materials_electrical',
]);

/** External professional / service-capable keys (not internal payroll). */
const EXTERNAL_SERVICE_EXACT_KEYS = new Set<string>([
  'external_service',
  'equipment_rental',
  'permits_fees',
  'project_travel',
  'other_direct',
  /** Generic labor is external/service-capable — NOT internal payroll. */
  'labor',
]);

function normalizeKey(key: string | null | undefined): string {
  return (key ?? '').trim().toLowerCase();
}

/**
 * Materials: exact allowlist + `materials_*` prefix.
 * No `.includes('materials')` — avoids false positives on unrelated keys.
 */
export function isMaterialEconomicCategoryKey(key: string | null | undefined): boolean {
  const normalized = normalizeKey(key);
  if (!normalized) return false;
  if (MATERIAL_EXACT_KEYS.has(normalized)) return true;
  if (normalized.startsWith('materials_')) return true;
  return false;
}

export function isSubcontractorEconomicCategoryKey(key: string | null | undefined): boolean {
  const normalized = normalizeKey(key);
  if (!normalized) return false;
  if (normalized === 'subcontractor') return true;
  if (normalized.startsWith('subcontractor_')) return true;
  if (normalized === 'external_manpower') return true;
  return false;
}

export function isExternalServiceEconomicCategoryKey(key: string | null | undefined): boolean {
  const normalized = normalizeKey(key);
  if (!normalized) return false;
  return EXTERNAL_SERVICE_EXACT_KEYS.has(normalized);
}

export function isInternalPayrollEconomicCategoryKey(key: string | null | undefined): boolean {
  return isInternalEmployeePayrollCategoryKey(key);
}

export const INTERNAL_PAYROLL_ECONOMIC_CATEGORY_KEY = INTERNAL_EMPLOYEE_PAYROLL_CATEGORY_KEY;

/**
 * Reliable subcontract attribution from TRANSACTION fields only.
 * Vendor capability / vendors.type / catalog links NEVER classify.
 * Allowed: explicit transaction category OR explicit subcontract agreement link.
 */
export function hasReliableSubcontractorSignal(input: {
  readonly categoryKey?: string | null;
  readonly subcontractAgreementId?: string | null;
}): boolean {
  if (input.subcontractAgreementId) return true;
  return isSubcontractorEconomicCategoryKey(input.categoryKey);
}

/** Keys that may never be stored as classification_status=classified. */
export function isNonAuthoritativeCategoryKey(key: string | null | undefined): boolean {
  const normalized = normalizeKey(key);
  return normalized === 'labor' || normalized === 'internal_employee_payroll';
}

/** Keys hidden from new Expense/AP selectors (legacy/historical only). */
export function isDeprecatedForNewTransactionEntry(key: string | null | undefined): boolean {
  return isNonAuthoritativeCategoryKey(key);
}

export interface ResolveOwnerBreakdownBucketInput {
  readonly sourceKind?: 'labor' | 'expense' | 'ap_bill' | 'month_close';
  readonly costFamily?: DbCostFamily | null;
  readonly categoryKey?: string | null;
  readonly vendorId?: string | null;
  /** @deprecated Ignored for classification — vendor type is never financial truth. */
  readonly vendorType?: string | null;
  /** @deprecated Ignored — vendor capability never classifies transactions. */
  readonly vendorRoleKeys?: readonly string[];
  readonly subcontractAgreementId?: string | null;
  /** Expense classification review state — never invent from free text. */
  readonly classificationStatus?: string | null;
}

/**
 * Exclusive Owner bucket from structured TRANSACTION classification only.
 * Vendor capability / type never decides the bucket.
 */
export function resolveOwnerBreakdownBucket(
  input: ResolveOwnerBreakdownBucketInput,
): OwnerBreakdownBucket {
  if (input.sourceKind === 'labor') return 'employees';
  if (input.sourceKind === 'month_close') return 'otherExpenses';

  const status = (input.classificationStatus ?? '').trim().toLowerCase();
  if (status === 'needs_classification') return 'otherExpenses';

  // Null/missing category on a non-workforce atom → Other (not vendor-inferred).
  const hasCategory =
    input.categoryKey != null && String(input.categoryKey).trim() !== '';
  if (!hasCategory && !input.subcontractAgreementId) {
    return 'otherExpenses';
  }

  if (input.costFamily === 'business_overhead') return 'overhead';

  if (isMaterialEconomicCategoryKey(input.categoryKey)) return 'materials';

  if (hasReliableSubcontractorSignal(input)) return 'subcontractors';

  if (hasCategory && input.vendorId) return 'vendors';

  if (hasCategory) return 'otherExpenses';

  return 'otherExpenses';
}

/**
 * Canonical transaction classification certainty (Expense + AP).
 * `classified` requires a structured cost_category_id; inventory/asset destination
 * alone is NOT a substitute — use needs_classification until category is chosen.
 */
export function resolveTransactionClassificationStatus(input: {
  readonly costCategoryId?: string | null;
  readonly categoryKey?: string | null;
}): ExpenseClassificationStatus {
  if (isNonAuthoritativeCategoryKey(input.categoryKey)) {
    return 'needs_classification';
  }
  if (input.costCategoryId != null && String(input.costCategoryId).trim() !== '') {
    return 'classified';
  }
  return 'needs_classification';
}

/** @alias {@link resolveTransactionClassificationStatus} */
export function resolveExpenseClassificationStatus(input: {
  readonly costCategoryId?: string | null;
  readonly categoryKey?: string | null;
  /** @deprecated Ignored — inventory destination does not replace transaction category. */
  readonly inventoryStockPurchase?: boolean;
  /** @deprecated Ignored — asset family does not replace transaction category. */
  readonly costFamily?: DbCostFamily | string | null;
}): ExpenseClassificationStatus {
  return resolveTransactionClassificationStatus(input);
}

/** AP line/bill classification uses identical semantics to Expense. */
export const resolveApClassificationStatus = resolveTransactionClassificationStatus;

/** Derived summary from line rows — not stored on ap_bills (lines are canonical). */
export function deriveApBillLineClassificationSummary(
  lines: readonly {
    readonly classificationStatus?: string | null;
    readonly costCategoryId?: string | null;
  }[],
): ExpenseClassificationStatus {
  if (lines.length === 0) return 'needs_classification';
  const allClassified = lines.every(
    (line) =>
      (line.classificationStatus ?? '').toLowerCase() === 'classified' &&
      line.costCategoryId != null &&
      String(line.costCategoryId).trim() !== '',
  );
  return allClassified ? 'classified' : 'needs_classification';
}

/**
 * Canonical rule: structured category family is economic truth.
 * Stored cost_family must match category.family when both are present.
 */
export function assertCostCategoryFamilyConsistent(input: {
  readonly costFamily?: DbCostFamily | string | null;
  readonly categoryFamily?: DbCostFamily | string | null;
  readonly costCategoryId?: string | null;
}): void {
  if (input.costCategoryId == null || String(input.costCategoryId).trim() === '') return;
  const family = (input.costFamily ?? '').toString().trim();
  const catFamily = (input.categoryFamily ?? '').toString().trim();
  if (!family || !catFamily) return;
  if (family !== catFamily) {
    throw new Error(
      `cost_family ${family} contradicts category family ${catFamily}`,
    );
  }
}

/** Sum exclusive Owner bucket amounts (same currency) for reconcile checks. */
export function sumExclusiveOwnerBucketAmounts(
  amounts: Readonly<Partial<Record<OwnerBreakdownBucket, MoneyValue>>>,
  currency: string,
): MoneyValue {
  const keys: OwnerBreakdownBucket[] = [
    'employees',
    'subcontractors',
    'vendors',
    'materials',
    'otherExpenses',
    'overhead',
  ];
  let total = zeroMoney(currency);
  for (const key of keys) {
    const value = amounts[key];
    if (!value) continue;
    if (value.currency.toUpperCase() !== currency.toUpperCase()) continue;
    total = addMoney(total, value);
  }
  return roundMoney(total);
}

/** Tiny helper for tests / smoke: wrap a numeric string as MoneyValue. */
export function ownerBucketMoney(amount: string, currency: string): MoneyValue {
  return money(amount, currency);
}
