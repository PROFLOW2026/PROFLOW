/**
 * Canonical Company Actual / Company Profit identities (managerial true cost).
 *
 * COMPANY ACTUAL
 *   = Σ Direct Project Actual
 *   + General recognized profit-affecting cost (pool)
 *
 * Automatic project allocation does NOT change Company Actual — only attribution.
 *
 * When fully allocatable:
 *   Σ Full Project Actual = Company Actual
 *
 * When no eligible projects:
 *   Σ Full Project Actual + Unallocatable General = Company Actual
 */

import {
  addMoney,
  isZeroMoney,
  money,
  roundMoney,
  subtractMoney,
  sumMoney,
  toNumericString,
  type MoneyValue,
  zeroMoney,
} from '@/shared/money';
import type { ProjectExpenseContribution } from './cost-aggregation';
import {
  computeUnallocatedOrganizationCosts,
  sumProjectTouchingExpenseNets,
} from './org-cost-reconciliation';

export type GeneralCostSourceKind =
  | 'expense_unallocated'
  | 'labor_monthly_unallocated'
  | 'labor_non_project'
  | 'ap_bill_remainder'
  | 'ap_bill_null_project'
  | 'inventory_writeoff'
  | 'other';

export interface GeneralCostSourceAtom {
  readonly kind: GeneralCostSourceKind;
  readonly amount: MoneyValue;
  readonly sourceId?: string | null;
  readonly label?: string | null;
}

/** Stable idempotency key for general_cost_month_sources (unique per month row). */
export function buildGeneralCostSourceKey(
  kind: GeneralCostSourceKind,
  sourceId?: string | null,
): string {
  return `${kind}:${sourceId ?? 'aggregate'}`;
}

export interface CompanyActualComposition {
  readonly currency: string;
  readonly directProjectActual: MoneyValue;
  readonly generalRecognizedActual: MoneyValue;
  readonly companyActual: MoneyValue;
  readonly allocatedGeneralToProjects: MoneyValue;
  readonly unallocatableGeneral: MoneyValue;
  readonly sumFullProjectActual: MoneyValue;
  readonly reconciles: boolean;
  readonly difference: MoneyValue;
}

export interface CompanyProfitComposition {
  readonly currency: string;
  readonly recognizedCompanyRevenue: MoneyValue | null;
  readonly companyActual: MoneyValue;
  readonly companyProfit: MoneyValue | null;
}

/** Sum general source atoms (same currency). */
export function sumGeneralCostSources(
  sources: readonly GeneralCostSourceAtom[],
  currency: string,
): MoneyValue {
  const values = sources
    .filter((s) => s.amount.currency.toUpperCase() === currency.toUpperCase())
    .map((s) => s.amount);
  return values.length === 0 ? zeroMoney(currency) : roundMoney(sumMoney(values, currency));
}

/**
 * Expense-layer unallocated remainder (existing identity) as a general source atom.
 */
export function expenseUnallocatedSource(input: {
  readonly orgFinalizedExpenseTotal: MoneyValue;
  readonly projectTouchingContributions: readonly ProjectExpenseContribution[];
}): GeneralCostSourceAtom {
  const currency = input.orgFinalizedExpenseTotal.currency;
  const projectTouching = sumProjectTouchingExpenseNets(
    input.projectTouchingContributions,
    currency,
  );
  const unallocated = computeUnallocatedOrganizationCosts({
    orgFinalizedExpenseTotal: input.orgFinalizedExpenseTotal,
    projectTouchingExpenseTotal: projectTouching,
  });
  return {
    kind: 'expense_unallocated',
    amount: unallocated,
    label: 'expense_unallocated',
  };
}

/**
 * Build Company Actual from Direct project sum + General pool.
 * `sumFullProjectActual` = Direct + allocated-to-projects general.
 */
export function composeCompanyActual(input: {
  readonly currency: string;
  readonly directProjectActual: MoneyValue;
  readonly generalPool: MoneyValue;
  readonly allocatedGeneralToProjects: MoneyValue;
  readonly unallocatableGeneral: MoneyValue;
}): CompanyActualComposition {
  const currency = input.currency.toUpperCase();
  const direct = roundMoney(input.directProjectActual);
  const general = roundMoney(input.generalPool);
  const allocated = roundMoney(input.allocatedGeneralToProjects);
  const unallocatable = roundMoney(input.unallocatableGeneral);
  const companyActual = roundMoney(addMoney(direct, general));
  const sumFullProjectActual = roundMoney(addMoney(direct, allocated));
  const expected = roundMoney(addMoney(sumFullProjectActual, unallocatable));
  const difference = roundMoney(subtractMoney(companyActual, expected));
  return {
    currency,
    directProjectActual: direct,
    generalRecognizedActual: general,
    companyActual,
    allocatedGeneralToProjects: allocated,
    unallocatableGeneral: unallocatable,
    sumFullProjectActual,
    reconciles: isZeroMoney(difference),
    difference,
  };
}

export function composeCompanyProfit(input: {
  readonly currency: string;
  readonly recognizedCompanyRevenue: MoneyValue | null;
  readonly companyActual: MoneyValue;
}): CompanyProfitComposition {
  const currency = input.currency.toUpperCase();
  const companyActual = roundMoney(input.companyActual);
  if (input.recognizedCompanyRevenue == null) {
    return {
      currency,
      recognizedCompanyRevenue: null,
      companyActual,
      companyProfit: null,
    };
  }
  const revenue = roundMoney(input.recognizedCompanyRevenue);
  return {
    currency,
    recognizedCompanyRevenue: revenue,
    companyActual,
    companyProfit: roundMoney(subtractMoney(revenue, companyActual)),
  };
}

/** Vendor bill conservation: NET = Σ project slices + general remainder. */
export function vendorBillConservation(input: {
  readonly recognizedNet: MoneyValue;
  readonly projectAllocated: MoneyValue;
  readonly generalRemainder: MoneyValue;
}): { readonly reconciles: boolean; readonly difference: MoneyValue } {
  const sum = addMoney(input.projectAllocated, input.generalRemainder);
  const difference = roundMoney(subtractMoney(input.recognizedNet, sum));
  return { reconciles: isZeroMoney(difference), difference };
}

/** Labor conservation: employer = project labor + general labor. */
export function laborConservation(input: {
  readonly totalEmployerCost: MoneyValue;
  readonly projectLabor: MoneyValue;
  readonly generalLabor: MoneyValue;
}): { readonly reconciles: boolean; readonly difference: MoneyValue } {
  const sum = addMoney(input.projectLabor, input.generalLabor);
  const difference = roundMoney(subtractMoney(input.totalEmployerCost, sum));
  return { reconciles: isZeroMoney(difference), difference };
}

export function assertCompanyActualReconciles(composition: CompanyActualComposition): void {
  if (!composition.reconciles) {
    throw new Error(
      `Company Actual does not reconcile: diff=${composition.difference.amount} ${composition.difference.currency}`,
    );
  }
}

export function moneyStringsEqual(a: MoneyValue, b: MoneyValue): boolean {
  return (
    a.currency.toUpperCase() === b.currency.toUpperCase() &&
    toNumericString(roundMoney(a)) === toNumericString(roundMoney(b))
  );
}

export function zeroIfNull(value: MoneyValue | null, currency: string): MoneyValue {
  return value ?? money('0', currency);
}

/**
 * Compose Company Actual from org rollup Full Project Actual + general-cost-month pool.
 * Direct = Full − allocated-to-projects (allocation does not change Company Actual).
 */
export function composeCompanyActualFromOrgTotals(input: {
  readonly currency: string;
  readonly fullProjectActual: MoneyValue | null;
  readonly poolAmount: MoneyValue;
  readonly allocatedAmount: MoneyValue;
  readonly unallocatableAmount: MoneyValue;
}): CompanyActualComposition | null {
  if (!input.fullProjectActual) return null;
  const allocated = roundMoney(input.allocatedAmount);
  const sameCurrency =
    allocated.currency.toUpperCase() === input.fullProjectActual.currency.toUpperCase();
  const direct = roundMoney(
    sameCurrency ? subtractMoney(input.fullProjectActual, allocated) : input.fullProjectActual,
  );
  return composeCompanyActual({
    currency: input.currency,
    directProjectActual: direct,
    generalPool: input.poolAmount,
    allocatedGeneralToProjects: allocated,
    unallocatableGeneral: input.unallocatableAmount,
  });
}

export function shouldSurfaceCompanyActual(
  composition: CompanyActualComposition | null,
): boolean {
  if (!composition) return false;
  return (
    !isZeroMoney(composition.companyActual) ||
    !isZeroMoney(composition.generalRecognizedActual)
  );
}

/** Surface company profit when general pool / company actual is disclosed and revenue is recognized. */
export function shouldSurfaceCompanyProfit(
  composition: CompanyActualComposition | null,
  profit: CompanyProfitComposition | null,
): boolean {
  if (!composition || !profit || profit.companyProfit == null) return false;
  return shouldSurfaceCompanyActual(composition);
}
