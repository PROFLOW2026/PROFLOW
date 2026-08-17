import { and, desc, eq } from 'drizzle-orm';
import {
  integrationEntityMappings,
  integrationSyncJobs,
  organizationIntegrations,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { normalizeStoredIntegrationStatus, unconfiguredCapabilities } from '../domain/status-guard';
import type {
  IntegrationKind,
  IntegrationStatus,
  IntegrationSyncDirection,
  OrganizationIntegrationRecord,
} from '../domain/types';

function mapIntegration(
  row: typeof organizationIntegrations.$inferSelect,
): OrganizationIntegrationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    providerKey: row.providerKey,
    integrationKind: row.integrationKind as IntegrationKind,
    status: normalizeStoredIntegrationStatus(row.status),
    capabilities: unconfiguredCapabilities(),
    syncDirection: (row.syncDirection as IntegrationSyncDirection) ?? 'none',
    lastError: row.lastError,
  };
}

export async function listOrganizationIntegrations(
  db: DbExecutor,
  organizationId: string,
): Promise<OrganizationIntegrationRecord[]> {
  const rows = await db
    .select()
    .from(organizationIntegrations)
    .where(eq(organizationIntegrations.organizationId, organizationId))
    .orderBy(organizationIntegrations.providerKey);
  return rows.map(mapIntegration);
}

export async function listIntegrationMappings(
  db: DbExecutor,
  organizationId: string,
): Promise<number> {
  const rows = await db
    .select({ id: integrationEntityMappings.id })
    .from(integrationEntityMappings)
    .where(eq(integrationEntityMappings.organizationId, organizationId));
  return rows.length;
}

export async function listRecentSyncJobs(
  db: DbExecutor,
  organizationId: string,
): Promise<{ id: string; status: string; jobKind: string; errorMessage: string | null }[]> {
  const rows = await db
    .select()
    .from(integrationSyncJobs)
    .where(eq(integrationSyncJobs.organizationId, organizationId))
    .orderBy(desc(integrationSyncJobs.createdAt))
    .limit(20);
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    jobKind: row.jobKind,
    errorMessage: row.errorMessage,
  }));
}

export async function ensureUnconfiguredAccountingRows(
  db: DbExecutor,
  organizationId: string,
  providerKeys: readonly string[],
): Promise<void> {
  for (const providerKey of providerKeys) {
    const [existing] = await db
      .select({ id: organizationIntegrations.id, status: organizationIntegrations.status })
      .from(organizationIntegrations)
      .where(
        and(
          eq(organizationIntegrations.organizationId, organizationId),
          eq(organizationIntegrations.providerKey, providerKey),
          eq(organizationIntegrations.integrationKind, 'accounting'),
        ),
      )
      .limit(1);
    if (existing) {
      normalizeStoredIntegrationStatus(existing.status);
      continue;
    }
    await db.insert(organizationIntegrations).values({
      organizationId,
      providerKey,
      integrationKind: 'accounting',
      status: 'unconfigured' satisfies IntegrationStatus,
      capabilitiesJson: {},
      syncDirection: 'none',
    });
  }
}
