import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  deleteInvoicingConnectionCredentials,
  loadInvoicingConnectionCredentials,
  saveInvoicingConnectionCredentials,
} from '../data/credentials.repository';
import { getProviderConnectionsRepository } from '../data/external-documents';
import { SUMIT_PROVIDER_ID, type InvoicingProviderCredentials } from '../domain/types';
import { sumitConnectionFailureMessageKey } from '../providers/sumit/sumit-connection-diagnostics';
import {
  createSumitHttpClient,
  SUMIT_TEST_API_BASE,
} from '../providers/sumit/sumit-http-client';
import { sumitProviderCapabilities } from '../providers/sumit/sumit-statutory-provider';
import {
  connectSumitTestSchema,
  type ConnectSumitTestInput,
} from '../validation/connection-schemas';

function assertTestEnvironmentOnly(): void {
  const appEnv = process.env.APP_ENV?.trim() || 'local';
  if (appEnv === 'production') {
    throw new DomainRuleError(
      'SUMIT production connections are not available in this release',
      'invoicingIntegration.errors.productionBlocked',
    );
  }
}

function logSumitTestConnectionFailure(
  organizationId: string,
  result: {
    failureClass?: string;
    httpStatus?: number | null;
    providerErrorCode?: string | null;
    safeProviderMessage?: string | null;
  },
): void {
  console.error('[invoicing][sumit] test connection failed', {
    organizationId,
    failureClass: result.failureClass ?? 'unknown',
    httpStatus: result.httpStatus ?? null,
    providerErrorCode: result.providerErrorCode ?? null,
    safeProviderMessage: result.safeProviderMessage ?? null,
  });
}

export async function connectSumitTestConfiguration(
  context: OrgContext,
  rawInput: ConnectSumitTestInput,
): Promise<{ connectionId: string; companyId: number }> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  assertTestEnvironmentOnly();

  const input = connectSumitTestSchema.parse(rawInput);
  const credentials: InvoicingProviderCredentials = {
    companyId: input.companyId,
    apiKey: input.apiKey,
  };

  const client = createSumitHttpClient(credentials, { baseUrl: SUMIT_TEST_API_BASE });
  const verification = await client.testConnection();
  if (!verification.ok) {
    logSumitTestConnectionFailure(context.organizationId, verification);
    throw new DomainRuleError(
      'Could not verify SUMIT test credentials',
      sumitConnectionFailureMessageKey(verification.failureClass),
      {
        failureClass: verification.failureClass,
        httpStatus: verification.httpStatus,
        providerErrorCode: verification.providerErrorCode,
      },
    );
  }

  const connection = await getProviderConnectionsRepository().upsert(context.db, {
    organizationId: context.organizationId,
    providerId: SUMIT_PROVIDER_ID,
    status: 'connected',
    credentialsRef: 'vault',
    capabilities: sumitProviderCapabilities(),
    connectedAt: new Date(),
  });

  await saveInvoicingConnectionCredentials(context.db, {
    organizationId: context.organizationId,
    connectionId: connection.id,
    credentials,
  });

  return { connectionId: connection.id, companyId: input.companyId };
}

export async function disconnectSumitProvider(context: OrgContext): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const repo = getProviderConnectionsRepository();
  const existing = await repo.findByOrganization(context.db, context.organizationId);
  if (!existing) return;

  await deleteInvoicingConnectionCredentials(
    context.db,
    context.organizationId,
    existing.id,
  );

  await repo.upsert(context.db, {
    organizationId: context.organizationId,
    providerId: existing.providerId,
    status: 'disconnected',
    credentialsRef: null,
    capabilities: {},
    connectedAt: null,
  });
}

export async function getSumitConnectionStatus(context: OrgContext): Promise<{
  connected: boolean;
  companyId: number | null;
  providerId: string | null;
}> {
  const existing = await getProviderConnectionsRepository().findByOrganization(
    context.db,
    context.organizationId,
  );
  if (!existing || existing.status !== 'connected' || existing.providerId !== SUMIT_PROVIDER_ID) {
    return { connected: false, companyId: null, providerId: existing?.providerId ?? null };
  }

  const credentials = await loadInvoicingConnectionCredentials(
    context.db,
    context.organizationId,
    existing.id,
  );

  return {
    connected: credentials != null,
    companyId: credentials?.companyId ?? null,
    providerId: existing.providerId,
  };
}
