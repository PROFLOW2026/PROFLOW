import { and, eq } from 'drizzle-orm';
import { organizationStorageConnections } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { StorageConnectionRecord, StorageConnectionStatus, StorageProviderKey } from '../domain/types';

function mapConnection(row: typeof organizationStorageConnections.$inferSelect): StorageConnectionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    provider: row.provider as StorageProviderKey,
    status: row.status as StorageConnectionStatus,
    isPrimary: row.isPrimary,
    externalAccountId: row.externalAccountId,
    externalAccountName: row.externalAccountName,
    externalAccountEmail: row.externalAccountEmail,
    externalTenantId: row.externalTenantId,
    rootFolderExternalId: row.rootFolderExternalId,
    rootFolderName: row.rootFolderName,
    scopesJson: (row.scopesJson as string[]) ?? [],
    tokenExpiresAt: row.tokenExpiresAt,
    connectedByUserId: row.connectedByUserId,
    connectedAt: row.connectedAt,
    lastValidatedAt: row.lastValidatedAt,
    lastError: row.lastError,
    quotaUsedBytes: row.quotaUsedBytes,
    quotaTotalBytes: row.quotaTotalBytes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listStorageConnections(
  db: DbExecutor,
  organizationId: string,
): Promise<StorageConnectionRecord[]> {
  const rows = await db
    .select()
    .from(organizationStorageConnections)
    .where(eq(organizationStorageConnections.organizationId, organizationId));
  return rows.map(mapConnection);
}

export async function findStorageConnectionByProvider(
  db: DbExecutor,
  organizationId: string,
  provider: StorageProviderKey,
): Promise<StorageConnectionRecord | null> {
  const [row] = await db
    .select()
    .from(organizationStorageConnections)
    .where(
      and(
        eq(organizationStorageConnections.organizationId, organizationId),
        eq(organizationStorageConnections.provider, provider),
      ),
    )
    .limit(1);
  return row ? mapConnection(row) : null;
}

export async function findStorageConnectionById(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
): Promise<StorageConnectionRecord | null> {
  const [row] = await db
    .select()
    .from(organizationStorageConnections)
    .where(
      and(
        eq(organizationStorageConnections.organizationId, organizationId),
        eq(organizationStorageConnections.id, connectionId),
      ),
    )
    .limit(1);
  return row ? mapConnection(row) : null;
}

export async function getPrimaryStorageConnection(
  db: DbExecutor,
  organizationId: string,
): Promise<StorageConnectionRecord | null> {
  const [row] = await db
    .select()
    .from(organizationStorageConnections)
    .where(
      and(
        eq(organizationStorageConnections.organizationId, organizationId),
        eq(organizationStorageConnections.isPrimary, true),
        eq(organizationStorageConnections.status, 'connected'),
      ),
    )
    .limit(1);
  return row ? mapConnection(row) : null;
}

export async function upsertStorageConnection(
  db: DbExecutor,
  input: {
    organizationId: string;
    provider: StorageProviderKey;
    status?: StorageConnectionStatus;
    isPrimary?: boolean;
  },
): Promise<StorageConnectionRecord> {
  const existing = await findStorageConnectionByProvider(db, input.organizationId, input.provider);
  if (existing) {
    const [updated] = await db
      .update(organizationStorageConnections)
      .set({
        status: input.status ?? existing.status,
        isPrimary: input.isPrimary ?? existing.isPrimary,
        updatedAt: new Date(),
      })
      .where(eq(organizationStorageConnections.id, existing.id))
      .returning();
    return mapConnection(updated!);
  }

  const [inserted] = await db
    .insert(organizationStorageConnections)
    .values({
      organizationId: input.organizationId,
      provider: input.provider,
      status: input.status ?? 'disconnected',
      isPrimary: input.isPrimary ?? false,
    })
    .returning();
  return mapConnection(inserted!);
}

export async function updateStorageConnection(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
  patch: Partial<{
    status: StorageConnectionStatus;
    isPrimary: boolean;
    externalAccountId: string | null;
    externalAccountName: string | null;
    externalAccountEmail: string | null;
    externalTenantId: string | null;
    rootFolderExternalId: string | null;
    rootFolderName: string;
    scopesJson: string[];
    tokenExpiresAt: Date | null;
    connectedByUserId: string | null;
    connectedAt: Date | null;
    lastValidatedAt: Date | null;
    lastError: string | null;
    quotaUsedBytes: number | null;
    quotaTotalBytes: number | null;
  }>,
): Promise<StorageConnectionRecord | null> {
  const [updated] = await db
    .update(organizationStorageConnections)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(organizationStorageConnections.organizationId, organizationId),
        eq(organizationStorageConnections.id, connectionId),
      ),
    )
    .returning();
  return updated ? mapConnection(updated) : null;
}

export async function clearPrimaryExcept(
  db: DbExecutor,
  organizationId: string,
  keepConnectionId: string,
): Promise<void> {
  await db
    .update(organizationStorageConnections)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(
      and(
        eq(organizationStorageConnections.organizationId, organizationId),
        eq(organizationStorageConnections.isPrimary, true),
      ),
    );
  await db
    .update(organizationStorageConnections)
    .set({ isPrimary: true, updatedAt: new Date() })
    .where(
      and(
        eq(organizationStorageConnections.organizationId, organizationId),
        eq(organizationStorageConnections.id, keepConnectionId),
      ),
    );
}
