import 'server-only';

import { and, eq } from 'drizzle-orm';
import { storageFiles, storageFolderMappings } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  findStorageConnectionById,
  updateStorageConnection,
} from '../data/connections.repository';
import { withProjectTemplateCapability } from '../domain/project-template';
import type { StorageConnectionRecord } from '../domain/types';
import { runCommittedStorageWrite } from '../data/storage-admin-write';
import { ensureUsablePrimaryStorageConnection } from './reconcile-primary-storage';

export type StorageTreeResetMode = 'soft_reset' | 'root_missing';

export interface StorageTreeResetResult {
  readonly connectionId: string;
  readonly mappingsDeleted: number;
  readonly filesDeleted: number;
  readonly mode: StorageTreeResetMode;
}

/**
 * Clears provider-tree bookkeeping for a connection without touching business
 * records (projects/clients/docs). Leaves OAuth credentials alone unless the
 * caller already disconnected.
 *
 * soft_reset — Owner/ops wipe before a fresh first-connect (status unchanged
 *   or forced disconnected by caller).
 * root_missing — Provider root was deleted outside ProjectFlow; mark
 *   reconnect_required and demote primary so UI stops "preparing forever".
 */
export async function clearStorageProviderTreeState(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
  options: {
    readonly mode: StorageTreeResetMode;
    /** Force connection status (e.g. keep disconnected after Owner wipe). */
    readonly status?: StorageConnectionRecord['status'];
  },
): Promise<StorageTreeResetResult> {
  const mode = options.mode;
  const wasPrimary = connection.isPrimary;

  const firstConnectionTemplate = withProjectTemplateCapability(
    {},
    {
      status: 'pending_approval',
      externalFolderId: null,
      approvedAt: null,
    },
  );

  let mappingsDeleted = 0;
  let filesDeleted = 0;

  await runCommittedStorageWrite(async (adminDb) => {
    const deletedMappings = await adminDb
      .delete(storageFolderMappings)
      .where(
        and(
          eq(storageFolderMappings.organizationId, organizationId),
          eq(storageFolderMappings.connectionId, connection.id),
        ),
      )
      .returning({ id: storageFolderMappings.id });
    mappingsDeleted = deletedMappings.length;

    const deletedFiles = await adminDb
      .delete(storageFiles)
      .where(
        and(
          eq(storageFiles.organizationId, organizationId),
          eq(storageFiles.connectionId, connection.id),
        ),
      )
      .returning({ id: storageFiles.id });
    filesDeleted = deletedFiles.length;

    const status =
      options.status ??
      (mode === 'root_missing' ? 'reconnect_required' : connection.status);

    const demotePrimary =
      (mode === 'root_missing' || options.status === 'disconnected') && wasPrimary;

    await updateStorageConnection(adminDb, organizationId, connection.id, {
      rootFolderExternalId: null,
      capabilitiesJson: firstConnectionTemplate as Record<string, unknown>,
      lastError: mode === 'root_missing' ? 'root_folder_missing' : null,
      status,
      ...(demotePrimary ? { isPrimary: false } : {}),
    });
  });

  if (
    (mode === 'root_missing' || options.status === 'disconnected') &&
    wasPrimary
  ) {
    await ensureUsablePrimaryStorageConnection(db, organizationId);
  }

  return {
    connectionId: connection.id,
    mappingsDeleted,
    filesDeleted,
    mode,
  };
}

/** Invalidate stale ready mappings when the provider ProjectFlow root is gone. */
export async function invalidateMissingProviderRoot(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
): Promise<StorageTreeResetResult> {
  return clearStorageProviderTreeState(db, organizationId, connection, {
    mode: 'root_missing',
  });
}

/**
 * Canonical Owner/ops wipe of connected-provider tree state for one connection.
 * Does not revoke OAuth or delete business entities. Prefer disconnect first
 * when re-testing first-connect from a blank slate.
 */
export async function resetOrganizationStorageProviderTree(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
  options?: { readonly forceDisconnected?: boolean },
): Promise<StorageTreeResetResult> {
  const connection = await findStorageConnectionById(db, organizationId, connectionId);
  if (!connection) {
    return {
      connectionId,
      mappingsDeleted: 0,
      filesDeleted: 0,
      mode: 'soft_reset',
    };
  }

  return clearStorageProviderTreeState(db, organizationId, connection, {
    mode: 'soft_reset',
    status: options?.forceDisconnected ? 'disconnected' : connection.status,
  });
}
