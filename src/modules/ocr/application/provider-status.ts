import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OcrProvider } from '../domain/provider';
import type { OcrProviderStatus } from '../domain/types';
import { getOcrProvider } from '../domain/stub-provider';

export function getOcrProviderStatus(
  context: OrgContext,
  provider: OcrProvider = getOcrProvider(),
): OcrProviderStatus {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const configured = provider.isConfigured();
  return {
    providerId: provider.id,
    configured,
    messageKey: configured ? 'providerConfiguredStub' : 'providerNotConfigured',
  };
}
