import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { getStoragePort } from '@/shared/ports/storage';
import {
  isMissingProviderObject,
  planDocumentByteRemoval,
  type DocumentByteRemovalPlan,
} from '../domain/document-byte-removal';
import {
  removeStorageObjectWithRetry,
  type StorageRemoveRetryResult,
} from '../domain/storage-cleanup';
import type { DocumentRecord } from '../domain/types';

export type DocumentByteRemovalOutcome =
  | { readonly attempted: false }
  | {
      readonly attempted: true;
      readonly removal: StorageRemoveRetryResult;
      readonly storageKey: string;
    };

const RETRYABLE_STORAGE_FILE_STATUSES = new Set(['pending', 'synced', 'error']);

/**
 * Removes stored bytes for a document delete.
 * External files go through adapter.deleteFile. supabase_legacy uses the Supabase port.
 * Does not upload business bytes.
 */
export async function removeDocumentStoredBytes(
  context: OrgContext,
  document: DocumentRecord,
): Promise<DocumentByteRemovalOutcome> {
  const extraExternalFileIds =
    document.storageBackend === 'external' ? await listLiveExternalFileIds(context, document.id) : [];
  const plan = planDocumentByteRemoval({
    storageBackend: document.storageBackend,
    externalConnectionId: document.externalConnectionId,
    externalFileId: document.externalFileId,
    storagePath: document.storagePath,
    extraExternalFileIds,
  });

  if (plan.kind === 'none') {
    return {
      attempted: true,
      removal: { ok: true, attempts: 0 },
      storageKey: document.externalFileId ?? document.storagePath,
    };
  }

  if (plan.kind === 'supabase_legacy') {
    const storage = getStoragePort();
    if (!storage.configured) return { attempted: false };
    const removal = await removeStorageObjectWithRetry((key) => storage.remove(key), plan.storagePath);
    return { attempted: true, removal, storageKey: plan.storagePath };
  }

  const removal = await removeStorageObjectWithRetry(
    async () => {
      await deleteExternalFiles(context, plan);
    },
    plan.fileIds[0] ?? document.id,
  );
  return { attempted: true, removal, storageKey: plan.fileIds.join(',') };
}

async function listLiveExternalFileIds(context: OrgContext, documentId: string): Promise<string[]> {
  const { listStorageFilesByDocumentId } = await import(
    '@/modules/external-storage/data/files.repository'
  );
  const files = await listStorageFilesByDocumentId(context.db, context.organizationId, documentId);
  return files
    .filter((file) => RETRYABLE_STORAGE_FILE_STATUSES.has(file.status))
    .map((file) => file.externalFileId);
}

async function deleteExternalFiles(
  context: OrgContext,
  plan: Extract<DocumentByteRemovalPlan, { kind: 'external' }>,
): Promise<void> {
  const { findStorageConnectionById } = await import(
    '@/modules/external-storage/data/connections.repository'
  );
  const { withStorageAccessToken } = await import(
    '@/modules/external-storage/application/connection-service'
  );
  const { getStorageProviderAdapter } = await import('@/modules/external-storage/providers/registry');
  const { ProviderHttpError } = await import('@/modules/external-storage/providers/http-utils');
  const { updateStorageFileByExternalId } = await import(
    '@/modules/external-storage/data/files.repository'
  );

  const connection = await findStorageConnectionById(
    context.db,
    context.organizationId,
    plan.connectionId,
  );
  if (!connection || connection.status !== 'connected') {
    throw new Error('storage_connection_unavailable');
  }

  const adapter = getStorageProviderAdapter(connection.provider);
  await withStorageAccessToken(context.db, context.organizationId, connection, async (accessToken) => {
    for (const fileId of plan.fileIds) {
      try {
        await adapter.deleteFile(accessToken, fileId);
      } catch (error) {
        if (error instanceof ProviderHttpError && isMissingProviderObject(error.status)) {
          // Provider object is already gone.
        } else {
          throw error;
        }
      }
      await updateStorageFileByExternalId(
        context.db,
        context.organizationId,
        plan.connectionId,
        fileId,
        { status: 'deleted', lastError: null },
      );
    }
  });
}
