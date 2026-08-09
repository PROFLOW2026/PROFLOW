import { DomainRuleError } from '@/shared/errors';
import type { ExpenseTargetingMode } from './types';

export interface ExpenseCurrencyContext {
  readonly baseCurrency: string;
}

export interface ExpenseCurrencyTargeting {
  readonly mode: ExpenseTargetingMode;
  readonly projectId: string | null;
}

export function resolveExpenseCurrency(
  context: ExpenseCurrencyContext,
  targeting: ExpenseCurrencyTargeting,
  projectCurrency: string | null | undefined,
  requestedCurrency: string,
): string {
  const requested = requestedCurrency.toUpperCase();

  if (targeting.mode === 'project') {
    const expected = (projectCurrency ?? context.baseCurrency).toUpperCase();
    if (requested !== expected) {
      throw new DomainRuleError(
        `Expense currency must match the project currency (${expected})`,
        'expenses.errors.currencyMustMatchProject',
        { expected, received: requested },
      );
    }
    return expected;
  }

  const expected = context.baseCurrency.toUpperCase();
  if (requested !== expected) {
    throw new DomainRuleError(
      `Overhead expense currency must match the organization base currency (${expected})`,
      'expenses.errors.currencyMustMatchOrganization',
      { expected, received: requested },
    );
  }
  return expected;
}
