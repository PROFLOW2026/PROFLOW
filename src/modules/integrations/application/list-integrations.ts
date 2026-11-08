import type { OrgContext } from '@/shared/auth/context';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getAccountingAdapter } from '../domain/unconfigured-adapter';
import type { IntegrationCatalogEntry } from '../domain/types';

/**
 * Entity mappings and sync jobs are revoked from the authenticated role.
 * This screen does not render them, and a failed user-role select aborts the
 * request transaction, so the settings path must not read those tables.
 */
export async function listAccountingIntegrations(context: OrgContext): Promise<{
  readonly catalog: readonly IntegrationCatalogEntry[];
  readonly adapterConnected: false;
  readonly canManage: boolean;
}> {
  assertPermission(context, PERMISSIONS.INTEGRATIONS_READ);
  const adapter = getAccountingAdapter();
  const status = adapter.getStatus();

  return {
    catalog: [],
    adapterConnected: status.connected,
    canManage: hasPermission(context, PERMISSIONS.SETTINGS_MANAGE),
  };
}
