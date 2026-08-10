import { DomainRuleError } from '@/shared/errors';
import type { StatutoryInvoicingProvider } from '../domain/provider';
import { isStatutoryInvoicingFeatureEnabled } from './provider-status';

export function assertStatutoryFeatureEnabled(provider: StatutoryInvoicingProvider): void {
  if (!isStatutoryInvoicingFeatureEnabled(provider)) {
    throw new DomainRuleError(
      'External statutory invoicing is disabled until a provider is configured',
      'invoicingIntegration.errors.connectionRequired',
      { providerId: provider.id },
    );
  }
}
