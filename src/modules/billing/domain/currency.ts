import { DomainRuleError } from '@/shared/errors';

export function assertBillingCurrencyMatchesProject(
  billingCurrency: string,
  projectCurrency: string,
): void {
  if (billingCurrency.toUpperCase() !== projectCurrency.toUpperCase()) {
    throw new DomainRuleError(
      'Billing currency must match the project currency',
      'billing.errors.currencyMismatch',
      { billingCurrency, projectCurrency },
    );
  }
}
