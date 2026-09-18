import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import type { StatutoryInvoicingProvider } from '../domain/provider';
import { getOrgInvoicingSettings } from '../data/org-invoicing-settings.repository';
import { isExternalProviderStatutoryMode } from '../domain/org-invoicing-settings';
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

export async function assertStatutoryFeatureEnabledForOrg(
  context: OrgContext,
  provider: StatutoryInvoicingProvider,
): Promise<void> {
  assertStatutoryFeatureEnabled(provider);
  const settings = await getOrgInvoicingSettings(context);
  if (!isExternalProviderStatutoryMode(settings)) {
    throw new DomainRuleError(
      'External statutory invoicing is disabled in manual mode',
      'invoicingIntegration.errors.manualModeActive',
    );
  }
}

export async function isExternalStatutoryUiEnabled(
  context: OrgContext,
  provider: StatutoryInvoicingProvider,
): Promise<boolean> {
  const settings = await getOrgInvoicingSettings(context);
  return isExternalProviderStatutoryMode(settings) && isStatutoryInvoicingFeatureEnabled(provider);
}
