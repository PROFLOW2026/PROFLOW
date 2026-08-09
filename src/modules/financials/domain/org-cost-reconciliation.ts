import {
  addMoney,
  fromNumericString,
  subtractMoney,
  sumMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { ProjectExpenseContribution } from './cost-aggregation';

/**
 * Expense-layer organization reconciliation (base currency only):
 *
 *   PROJECT-TOUCHING EXPENSE NETS
 *   + UNALLOCATED ORGANIZATION COSTS
 *   = ORGANIZATION FINALIZED EXPENSE TOTAL
 *
 * Project-touching = direct expenses with a project + allocation lines targeting a project.
 * Unallocated = finalized org/shared/overhead NET that has not landed on any project.
 *
 * Workforce Mode C labor sits outside this equation (project cost only, not an expense row).
 * Unallocated costs must NOT be forced into project profit / Actual Project Cost.
 */
export function sumProjectTouchingExpenseNets(
  contributions: readonly ProjectExpenseContribution[],
  currency: string,
): MoneyValue {
  const values: MoneyValue[] = [];
  for (const contribution of contributions) {
    if (contribution.currency.toUpperCase() !== currency.toUpperCase()) continue;
    const money = fromNumericString(contribution.amount, contribution.currency);
    if (money) values.push(money);
  }
  return values.length === 0 ? zeroMoney(currency) : sumMoney(values, currency);
}

export function computeUnallocatedOrganizationCosts(input: {
  readonly orgFinalizedExpenseTotal: MoneyValue;
  readonly projectTouchingExpenseTotal: MoneyValue;
}): MoneyValue {
  return subtractMoney(input.orgFinalizedExpenseTotal, input.projectTouchingExpenseTotal);
}

/** True when project-touching + unallocated equals the org finalized expense total. */
export function expenseTotalsReconcile(input: {
  readonly projectTouching: MoneyValue;
  readonly unallocated: MoneyValue;
  readonly orgFinalizedExpenseTotal: MoneyValue;
}): boolean {
  const sum = addMoney(input.projectTouching, input.unallocated);
  return (
    sum.currency.toUpperCase() === input.orgFinalizedExpenseTotal.currency.toUpperCase() &&
    sum.amount === input.orgFinalizedExpenseTotal.amount
  );
}
