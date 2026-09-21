import 'server-only';

import { and, eq } from 'drizzle-orm';
import { storageFolderMappings } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { StorageConnectionRecord } from '../domain/types';
import { getStorageProviderAdapter } from '../providers/registry';

export interface LegacyClientNestedProjectFolder {
  readonly clientId: string;
  readonly clientName: string;
  readonly clientFolderId: string;
  readonly folderId: string;
  readonly folderName: string;
  readonly empty: boolean;
  readonly fileCount: number;
  readonly subfolderCount: number;
  readonly deleted: boolean;
}

/**
 * Finds project-like folders still nested under client folders.
 * Deletes only completely empty ones. Non-empty folders are reported and left alone.
 */
export async function cleanupLegacyClientNestedProjectFolders(
  db: DbExecutor,
  input: {
    organizationId: string;
    connection: StorageConnectionRecord;
    accessToken: string;
  },
): Promise<readonly LegacyClientNestedProjectFolder[]> {
  const adapter = getStorageProviderAdapter(input.connection.provider);
  const clientMappings = await db
    .select({
      clientId: storageFolderMappings.entityId,
      clientName: storageFolderMappings.displayName,
      folderId: storageFolderMappings.externalFolderId,
    })
    .from(storageFolderMappings)
    .where(
      and(
        eq(storageFolderMappings.organizationId, input.organizationId),
        eq(storageFolderMappings.connectionId, input.connection.id),
        eq(storageFolderMappings.semanticFolderType, 'client_root'),
        eq(storageFolderMappings.status, 'ready'),
      ),
    );

  const results: LegacyClientNestedProjectFolder[] = [];
  for (const client of clientMappings) {
    if (!client.clientId || !client.folderId || client.folderId === 'pending') continue;
    const listing = await adapter.listFolder(input.accessToken, client.folderId);
    for (const folder of listing.folders) {
      const nested = await adapter.listFolder(input.accessToken, folder.id);
      const empty = nested.folders.length === 0 && nested.files.length === 0;
      let deleted = false;
      if (empty) {
        await adapter.deleteFolder(input.accessToken, folder.id);
        deleted = true;
      }
      results.push({
        clientId: client.clientId,
        clientName: client.clientName,
        clientFolderId: client.folderId,
        folderId: folder.id,
        folderName: folder.name,
        empty,
        fileCount: nested.files.length,
        subfolderCount: nested.folders.length,
        deleted,
      });
    }
  }
  return results;
}
