/**
 * Owner-facing allocation method keys → simple Hebrew labels.
 * Keys match expense allocation methods and general-cost-month basis modes.
 */
const ALLOCATION_METHOD_HEBREW: Readonly<Record<string, string>> = {
  manual_amount: 'סכום ידני',
  manual_percent: 'אחוז ידני',
  contract_weight: 'לפי שווי הפרויקטים',
  labor_hours_weight: 'לפי שעות עבודה',
  direct_cost_weight: 'לפי עלויות ישירות',
  equal_split: 'חלוקה שווה',
  direct_actual_weight: 'לפי עלויות ישירות',
  none: 'לא הוקצה',
  category_default: 'לפי ברירת המחדל של הקטגוריה',
};

const GENERAL_COST_SOURCE_HEBREW: Readonly<Record<string, string>> = {
  expense_unallocated: 'הוצאות כלליות של העסק',
  labor_monthly_unallocated: 'עלות עבודה חודשית שלא הוקצתה לפרויקט',
  labor_non_project: 'עלות עבודה לא פרויקטית',
  ap_bill_remainder: 'יתרת חשבונות ספקים',
  ap_bill_null_project: 'חשבונות ספקים ללא פרויקט',
  inventory_writeoff: 'גריעת מלאי',
  other: 'מקורות אחרים',
};

export function resolveGeneralCostSourceLabelHebrew(kind: string | null | undefined): string | null {
  if (!kind) return null;
  return GENERAL_COST_SOURCE_HEBREW[kind] ?? null;
}

export function resolveAllocationMethodLabelHebrew(method: string | null | undefined): string | null {
  if (!method) return null;
  return ALLOCATION_METHOD_HEBREW[method] ?? null;
}

export function resolveAllocationMethodKey(
  expenseDriverMethod: string | null | undefined,
  monthBasisMode: string | null | undefined,
  categoryDefaultMethod: string | null | undefined,
): string | null {
  if (expenseDriverMethod) return expenseDriverMethod;
  if (monthBasisMode && monthBasisMode !== 'none') return monthBasisMode;
  if (categoryDefaultMethod) return 'category_default';
  return monthBasisMode ?? null;
}
