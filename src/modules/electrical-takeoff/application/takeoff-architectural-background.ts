import 'server-only';

import { findDocumentById } from '@/modules/documents';
import { ensureUsablePrimaryStorageConnection } from '@/modules/external-storage/application/reconcile-primary-storage';
import { resolveValidAccessToken } from '@/modules/external-storage/application/connection-service';
import { getStorageProviderAdapter } from '@/modules/external-storage/providers/registry';
import type { DbExecutor } from '@/shared/db/types';
import { backgroundRequestAllowed, sameCadFile } from '../domain/architectural-background';
import { findFile, latestSuccessfulJob, listSheetsForJob } from '../data/takeoff.repository';

export async function openArchitecturalBackground(input: {
  db: DbExecutor;
  organizationId: string;
  fileId: string;
  requestedName: string;
}): Promise<{ stream: ReadableStream<Uint8Array>; mimeType: string; sizeBytes: number | null } | null> {
  const requested = input.requestedName.trim();
  if (requested.length < 1 || requested.length > 180 || requested.includes('..')) return null;
  const file = await findFile(input.db, input.organizationId, input.fileId);
  if (!file || file.uploadState !== 'complete' || !file.storageDocumentId) return null;
  const job = await latestSuccessfulJob(input.db, input.organizationId, file.analysisId);
  if (!job) return null;
  const sheets = await listSheetsForJob(input.db, input.organizationId, job.id);
  const recorded = sheets
    .filter((sheet) => sheet.fileId === file.id)
    .flatMap((sheet) => sheet.xrefsMissing ?? []);
  if (!backgroundRequestAllowed(requested, recorded)) return null;

  const document = await findDocumentById(input.db, input.organizationId, file.storageDocumentId);
  const folderId = document?.externalParentFolderId?.trim();
  if (!document || !folderId) return null;

  try {
    const connection = await ensureUsablePrimaryStorageConnection(input.db, input.organizationId);
    if (!connection) return null;
    const token = await resolveValidAccessToken(input.db, input.organizationId, connection);
    const adapter = getStorageProviderAdapter(connection.provider);
    const listing = await adapter.listFolder(token, folderId);
    const match = listing.files.find((item) => sameCadFile(item.name, requested));
    if (!match) return null;
    const downloaded = await adapter.downloadFileStream(token, match.id, { knownMeta: match });
    return {
      stream: downloaded.stream,
      mimeType: downloaded.mimeType || 'application/octet-stream',
      sizeBytes: match.sizeBytes ?? downloaded.sizeBytes ?? null,
    };
  } catch {
    return null;
  }
}
