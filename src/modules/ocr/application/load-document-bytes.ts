import { createHash } from 'node:crypto';
import { findDocumentById, updateDocumentById } from '@/modules/documents/lookups';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ServiceUnavailableError } from '@/shared/errors';
import { getStoragePort, StorageNotConfiguredError } from '@/shared/ports/storage';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function loadDocumentBytesForOcr(
  context: OrgContext,
  documentId: string,
): Promise<{
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  checksumSha256: string;
}> {
  const document = await findDocumentById(context.db, context.organizationId, documentId);
  if (!document || document.deletedAt || document.status === 'deleted') {
    throw new NotFoundError('Document');
  }
  if (document.status !== 'available') {
    throw new DomainRuleError('Document is not ready for reading', 'ocr.errors.documentNotReady');
  }

  if (document.storageBackend === 'external' && document.externalFileId) {
    const { getExternalDocumentDownload } = await import('@/modules/external-storage/server');
    const payload = await getExternalDocumentDownload(context, document.id);
    if ('url' in payload) {
      const response = await fetch(payload.url);
      if (!response.ok) {
        throw new ServiceUnavailableError(
          'External file unavailable',
          'externalStorage.errors.fileUnavailable',
        );
      }
      const buffer = new Uint8Array(await response.arrayBuffer());
      const checksumSha256 = document.checksum ?? sha256Hex(buffer);
      return {
        bytes: buffer,
        mimeType: payload.mimeType,
        filename: payload.filename,
        checksumSha256,
      };
    }
    const buffer = new Uint8Array(await new Response(payload.stream).arrayBuffer());
    const checksumSha256 = document.checksum ?? sha256Hex(buffer);
    return {
      bytes: buffer,
      mimeType: payload.mimeType,
      filename: payload.filename,
      checksumSha256,
    };
  }

  const storage = getStoragePort();
  if (!storage.configured) {
    throw new ServiceUnavailableError(
      'File storage is not configured',
      'documents.errors.storageNotConfigured',
    );
  }

  try {
    const downloaded = await storage.downloadBytes(document.storagePath);
    const checksumSha256 = sha256Hex(downloaded.bytes);
    if (document.checksum !== checksumSha256) {
      await updateDocumentById(context.db, context.organizationId, document.id, {
        checksum: checksumSha256,
        sizeBytes: downloaded.size,
      });
    }
    return {
      bytes: downloaded.bytes,
      mimeType: document.mimeType,
      filename: document.originalFilename,
      checksumSha256,
    };
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      throw new ServiceUnavailableError(
        'File storage is not configured',
        'documents.errors.storageNotConfigured',
      );
    }
    throw error;
  }
}
