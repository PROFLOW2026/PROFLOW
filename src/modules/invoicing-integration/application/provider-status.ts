import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { StatutoryInvoicingProvider } from '../domain/provider';
import { getStatutoryInvoicingProvider } from '../domain/unconfigured-provider';
import {
  DISABLED_CAPABILITIES,
  FULL_ADAPTER_CAPABILITIES,
  type StatutoryProviderStatus,
} from '../domain/types';

export function getStatutoryProviderStatus(
  context: OrgContext,
  provider: StatutoryInvoicingProvider = getStatutoryInvoicingProvider(),
): StatutoryProviderStatus {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const configured = provider.isConfigured();
  const featureEnabled = provider.isFeatureEnabled() && configured;
  return {
    providerId: provider.id,
    configured,
    featureEnabled,
    messageKey: featureEnabled
      ? 'invoicingIntegration.status.providerConnected'
      : 'invoicingIntegration.status.connectionRequired',
    capabilities: featureEnabled ? FULL_ADAPTER_CAPABILITIES : DISABLED_CAPABILITIES,
  };
}

/** Pure gate used by application services and UI - no permission side effects. */
export function isStatutoryInvoicingFeatureEnabled(
  provider: StatutoryInvoicingProvider = getStatutoryInvoicingProvider(),
): boolean {
  return provider.isFeatureEnabled() && provider.isConfigured();
}
