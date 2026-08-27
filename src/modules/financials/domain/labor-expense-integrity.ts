/**
 * V1 labor double-count rule (docs/financial/LABOR-COST-INTEGRITY.md).
 *
 * Mode B (legacy): generic system category key `labor` — external/service-capable;
 * stays in Actual even when workforce True Cost is present.
 * Mode B' (0070+): `internal_employee_payroll` — RESTRICTED exception classification.
 * Mode C: time-entry / monthly True Cost.
 *
 * Internal employee payroll must NEVER silently duplicate Workforce Actual.
 * Recognition: always exclude `internal_employee_payroll` expenses from Actual.
 * External labor / subcontractor / manpower remain legitimate and separate.
 */

/** Legacy / display system cost-category key (external labor / service-capable). */
export const LABOR_COST_CATEGORY_KEY = 'labor';

/** Explicit internal employee payroll — restricted; never silent ordinary Actual. */
export const INTERNAL_EMPLOYEE_PAYROLL_CATEGORY_KEY = 'internal_employee_payroll';

export function isLaborCostCategoryKey(key: string | null | undefined): boolean {
  return (key ?? '').trim().toLowerCase() === LABOR_COST_CATEGORY_KEY;
}

export function isInternalEmployeePayrollCategoryKey(key: string | null | undefined): boolean {
  return (key ?? '').trim().toLowerCase() === INTERNAL_EMPLOYEE_PAYROLL_CATEGORY_KEY;
}

/**
 * Whether a contribution should be omitted from Actual under the V1 rule.
 *
 * ALWAYS true for `internal_employee_payroll` (restricted — Workforce is the
 * only internal payroll Actual path). Generic `labor` never excludes.
 *
 * `hasWorkforceData` / project id sets are retained for caller compatibility
 * but are not required to exclude internal payroll.
 */
export function shouldExcludeLaborExpenseForWorkforce(input: {
  /** True when category is internal_employee_payroll (loader exclusion flag). */
  readonly isLaborCategory?: boolean;
  readonly categoryKey?: string | null;
  readonly projectId: string | null;
  readonly hasWorkforceData: boolean;
  readonly projectIdsWithWorkforceLabor?: ReadonlySet<string>;
}): boolean {
  const hasCategoryKey = input.categoryKey != null && String(input.categoryKey).trim() !== '';
  const isInternalPayroll = hasCategoryKey
    ? isInternalEmployeePayrollCategoryKey(input.categoryKey)
    : input.isLaborCategory === true;

  return isInternalPayroll;
}

/**
 * App-layer guard: ordinary Expense/AP must never use internal_employee_payroll.
 * Workforce is the only internal payroll Actual path (DB also enforces).
 */
export function assertInternalPayrollExpenseAllowed(input: {
  readonly categoryKey?: string | null;
}): void {
  if (!isInternalEmployeePayrollCategoryKey(input.categoryKey)) return;
  const err = new Error(
    'internal_employee_payroll is not allowed on ordinary Expense/AP; use Workforce',
  );
  err.name = 'DomainRuleError';
  throw err;
}
