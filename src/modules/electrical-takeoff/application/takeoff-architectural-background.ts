import 'server-only';

import { findDocumentById } from '@/modules/documents';
import { ensureUsablePrimaryStorageConnection } from '@/modules/external-storage/application/reconcile-primary-storage';
import { resolveValidAccessToken } from '@/modules/external-storage/application/connection-service';
import { getStorageProviderAdapter } from '@/modules/external-storage/providers/registry';
import type { DbExecutor } from '@/shared/db/types';
import { resolveStorageXrefPath } from '@/modules/external-storage/application/resolve-storage-xref';
import type { XrefWalkListing } from '@/modules/external-storage/domain/xref-folder-walk';
import type { StorageProviderAdapter } from '@/modules/external-storage/domain/provider-interface';
import { backgroundRequestAllowed, sameCadFile } from '../domain/architectural-background';
import { findFile, latestSuccessfulJob, listSheetsForJob } from '../data/takeoff.repository';

export async function openArchitecturalBackground(input: {
  db: DbExecutor;
  organizationId: string;
  fileId: string;
  requestedName: string;
  gate?: (providerFileId: string) => 'allow' | 'hidden' | Promise<'allow' | 'hidden'>;
  rootFolderId?: string;
}): Promise<{ stream: ReadableStream<Uint8Array>; mimeType: string; sizeBytes: number | null; providerFileId: string } | null> {
  const requested = input.requestedName.trim();
  if (requested.length < 1 || requested.length > 500) return null;
  const file = await findFile(input.db, input.organizationId, input.fileId);
  if (!file || file.uploadState !== 'complete' || !file.storageDocumentId) return null;
  const job = await latestSuccessfulJob(input.db, input.organizationId, file.analysisId);
  if (!job) return null;
  const sheets = await listSheetsForJob(input.db, input.organizationId, job.id);
  const recorded = sheets
    .filter((sheet) => sheet.fileId === file.id)
    .flatMap((sheet) => [...(sheet.xrefsMissing ?? []), ...(sheet.xrefRefs ?? [])]);
  if (!backgroundRequestAllowed(requested, recorded)) return null;
  const recordedPath = recorded.find(
    (row) => sameCadFile(requested, row.name) || (row.path ? sameCadFile(requested, row.path) : false),
  )?.path;

  const document = await findDocumentById(input.db, input.organizationId, file.storageDocumentId);
  const folderId = document?.externalParentFolderId?.trim();
  if (!document || !folderId) return null;

  try {
    const connection = await ensureUsablePrimaryStorageConnection(input.db, input.organizationId);
    if (!connection) return null;
    const token = await resolveValidAccessToken(input.db, input.organizationId, connection);
    const adapter = getStorageProviderAdapter(connection.provider);
    const resolved = await resolveStorageXrefPath({
      adapter,
      accessToken: token,
      startFolderId: folderId,
      xrefPath: recordedPath?.trim() || requested,
      xrefName: requested,
      gate: input.gate,
      rootFolderId: input.rootFolderId,
    });
    if (!resolved) return null;
    const downloaded = await adapter.downloadFileStream(token, resolved.fileId, { knownMeta: null });
    return {
      stream: downloaded.stream,
      mimeType: downloaded.mimeType || 'application/octet-stream',
      sizeBytes: resolved.sizeBytes ?? downloaded.sizeBytes ?? null,
      providerFileId: resolved.fileId,
    };
  } catch {
    return null;
  }
}

export async function openWorkerXref(input: {
  db: DbExecutor;
  organizationId: string;
  fileId: string;
  xrefPath: string;
  anchorPath?: string;
  gate?: (providerFileId: string) => 'allow' | 'hidden' | Promise<'allow' | 'hidden'>;
  rootFolderId?: string;
}): Promise<{ stream: ReadableStream<Uint8Array>; mimeType: string; sizeBytes: number | null; providerFileId: string } | null> {
  const xrefPath = input.xrefPath.trim();
  if (xrefPath.length < 1 || xrefPath.length > 500) return null;
  const file = await findFile(input.db, input.organizationId, input.fileId);
  if (!file || file.uploadState !== 'complete' || !file.storageDocumentId) return null;
  const document = await findDocumentById(input.db, input.organizationId, file.storageDocumentId);
  const folderId = document?.externalParentFolderId?.trim();
  if (!folderId) return null;
  try {
    const connection = await ensureUsablePrimaryStorageConnection(input.db, input.organizationId);
    if (!connection) return null;
    const token = await resolveValidAccessToken(input.db, input.organizationId, connection);
    const adapter = getStorageProviderAdapter(connection.provider);
    const resolved = await resolveStorageXrefPath({
      adapter,
      accessToken: token,
      startFolderId: folderId,
      xrefPath,
      xrefName: xrefPath,
      anchorPath: input.anchorPath,
      gate: input.gate,
      rootFolderId: input.rootFolderId,
    });
    if (!resolved) return null;
    const downloaded = await adapter.downloadFileStream(token, resolved.fileId, { knownMeta: null });
    return {
      stream: downloaded.stream,
      mimeType: downloaded.mimeType || 'application/octet-stream',
      sizeBytes: resolved.sizeBytes ?? downloaded.sizeBytes ?? null,
      providerFileId: resolved.fileId,
    };
  } catch {
    return null;
  }
}

export function providerListing(adapter: StorageProviderAdapter, token: string) {
  return {
    listFolder: async (folderId: string): Promise<XrefWalkListing> => {
      const listing = await adapter.listFolder(token, folderId);
      return {
        files: listing.files.map((file) => ({
          id: file.id,
          name: file.name,
          kind: 'file' as const,
          sizeBytes: file.sizeBytes,
          parentId: file.parentId,
        })),
        folders: listing.folders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          kind: 'folder' as const,
          parentId: folder.parentId,
        })),
      };
    },
    getParentId: async (folderId: string) => (await adapter.getFolder(token, folderId))?.parentId ?? null,
  };
}
