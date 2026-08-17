import type { OrgContext } from '@/shared/auth/context';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getAccountingAdapter } from '../domain/unconfigured-adapter';
import type { IntegrationCatalogEntry } from '../domain/types';
import {
  listIntegrationMappings,
  listRecentSyncJobs,
} from '../data/integrations.repository';

export async function listAccountingIntegrations(context: OrgContext): Promise<{
  readonly catalog: readonly IntegrationCatalogEntry[];
  readonly mappingCount: number;
  readonly syncJobs: readonly { id: string; status: string; jobKind: string; errorMessage: string | null }[];
  readonly adapterConnected: false;
  readonly canManage: boolean;
}> {
  assertPermission(context, PERMISSIONS.INTEGRATIONS_READ);
  const adapter = getAccountingAdapter();
  const status = adapter.getStatus();

  return {
    catalog: [],
    mappingCount: await listIntegrationMappings(context.db, context.organizationId).catch(() => 0),
    syncJobs: await listRecentSyncJobs(context.db, context.organizationId).catch(() => []),
    adapterConnected: status.connected,
    canManage: hasPermission(context, PERMISSIONS.SETTINGS_MANAGE),
  };
}
