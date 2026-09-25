import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { loadInvoicingConnectionCredentials } from '../data/credentials.repository';
import { getProviderConnectionsRepository } from '../data/external-documents';
import type { StatutoryInvoicingProvider } from '../domain/provider';
import { areInvoicingIntegrationTablesAvailable } from '../domain/persistence';
import { SUMIT_PROVIDER_ID } from '../domain/types';
import { createDefaultStatutoryProvider } from '../domain/unconfigured-provider';
import { SumitStatutoryProvider } from '../providers/sumit/sumit-statutory-provider';

export async function resolveStatutoryProviderForOrg(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
): Promise<StatutoryInvoicingProvider> {
  if (!areInvoicingIntegrationTablesAvailable()) {
    return createDefaultStatutoryProvider();
  }

  const connection = await getProviderConnectionsRepository().findByOrganization(
    context.db,
    context.organizationId,
  );

  if (!connection || connection.status !== 'connected') {
    return createDefaultStatutoryProvider();
  }

  if (connection.providerId !== SUMIT_PROVIDER_ID) {
    return createDefaultStatutoryProvider();
  }

  const credentials = await loadInvoicingConnectionCredentials(
    context.db,
    context.organizationId,
    connection.id,
  );
  if (!credentials) {
    return createDefaultStatutoryProvider();
  }

  return new SumitStatutoryProvider({ credentials });
}
