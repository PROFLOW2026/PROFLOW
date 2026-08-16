import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  getOcrFeatureMode,
  isOcrIngestionEnabled,
} from '../domain/feature-gate';
import type { OcrProvider } from '../domain/provider';
import { getOcrProvider } from '../domain/provider-registry';
import type { OcrProviderStatus } from '../domain/types';

/** Provider/mode snapshot with no secrets. Safe to render in Settings. */
export function readOcrProviderStatus(
  provider: OcrProvider = getOcrProvider(),
): OcrProviderStatus {
  const featureMode = getOcrFeatureMode();
  const configured = provider.isConfigured();
  const ingestionEnabled = isOcrIngestionEnabled();

  let messageKey: OcrProviderStatus['messageKey'];
  if (featureMode === 'disabled') {
    messageKey = 'featureDisabled';
  } else if (featureMode === 'fixture_only') {
    messageKey = 'fixtureOnlyMode';
  } else if (featureMode === 'configured_pending') {
    // Credentials may exist; extract still returns empty_result skeleton.
    messageKey = 'providerConfiguredPending';
  } else if (featureMode === 'live' && provider.id !== 'stub' && configured) {
    messageKey = 'providerLiveReady';
  } else if (configured) {
    messageKey = 'providerConfiguredStub';
  } else {
    messageKey = 'providerNotConfigured';
  }

  return {
    providerId: provider.id,
    configured,
    featureMode,
    ingestionEnabled,
    messageKey,
  };
}

export function getOcrProviderStatus(
  context: OrgContext,
  provider: OcrProvider = getOcrProvider(),
): OcrProviderStatus {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  return readOcrProviderStatus(provider);
}

/** Azure live path needs both key and endpoint - never return their values. */
export function azureOcrNeedsKeyAndEndpoint(
  status: Pick<OcrProviderStatus, 'providerId' | 'configured'> = readOcrProviderStatus(),
): boolean {
  return status.providerId === 'azure' && !status.configured;
}
