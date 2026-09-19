import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import {
  getProviderConnectionsRepository,
  loadInvoicingConnectionCredentials,
} from '@/modules/invoicing-integration';
import { SUMIT_PROVIDER_ID } from '@/modules/invoicing-integration/domain/types';
import {
  createSumitHttpClient,
  type SumitHttpClient,
} from '@/modules/invoicing-integration/providers/sumit/sumit-http-client';

export async function resolveSumitHttpClientForOrg(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
): Promise<SumitHttpClient | null> {
  const connection = await getProviderConnectionsRepository().findByOrganization(
    context.db,
    context.organizationId,
  );
  if (!connection || connection.status !== 'connected' || connection.providerId !== SUMIT_PROVIDER_ID) {
    return null;
  }
  const credentials = await loadInvoicingConnectionCredentials(
    context.db,
    context.organizationId,
    connection.id,
  );
  if (!credentials) return null;
  return createSumitHttpClient(credentials);
}
