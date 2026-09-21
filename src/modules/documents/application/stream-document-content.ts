import 'server-only';

import { parseByteRangeHeader } from '@/modules/external-storage/server/byte-range';
import { NotFoundError, ServiceUnavailableError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { getStoragePort, StorageNotConfiguredError } from '@/shared/ports/storage';
import { findDocumentById } from '../data/documents.repository';
import {
  assertCanReadStoredDocument,
  assertDocumentReadPermission,
} from './document-visibility';
import { documentIdSchema } from '../validation/schemas';

export type StreamDocumentContentResult =
  | { unsatisfiable: true; sizeBytes: number | null }
  | {
      stream: ReadableStream<Uint8Array>;
      filename: string;
      mimeType: string;
      sizeBytes: number | null;
      httpStatus: number;
      contentRange: string | null;
      byteRange: { start: number; end: number } | null;
    };

export async function streamDocumentContent(
  context: OrgContext,
  rawInput: { documentId: string; rangeHeader?: string | null },
): Promise<StreamDocumentContentResult> {
  const parsed = documentIdSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const document = await findDocumentById(context.db, context.organizationId, parsed.data.documentId);
  if (!document) throw new NotFoundError('Document');
  await assertDocumentReadPermission(context, document.id);
  await assertCanReadStoredDocument(context, document);

  if (document.status !== 'available' || document.deletedAt) {
    throw new NotFoundError('Document');
  }

  if (document.storageBackend === 'external') {
    const { streamExternalDocumentDownload } = await import('@/modules/external-storage/server');
    return streamExternalDocumentDownload(context, document.id, {
      rangeHeader: rawInput.rangeHeader ?? null,
    });
  }

  const storage = getStoragePort();
  if (!storage.configured) {
    throw new ServiceUnavailableError(
      'File storage is not configured',
      'documents.errors.storageNotConfigured',
    );
  }

  let downloaded;
  try {
    downloaded = await storage.downloadBytes(document.storagePath);
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      throw new ServiceUnavailableError(
        'File storage is not configured',
        'documents.errors.storageNotConfigured',
      );
    }
    throw error;
  }

  const sizeBytes = downloaded.size ?? document.sizeBytes ?? downloaded.bytes.length;
  let byteRange: { start: number; end: number } | null = null;
  if (rawInput.rangeHeader) {
    const parsedRange = parseByteRangeHeader(rawInput.rangeHeader, sizeBytes);
    if (parsedRange === 'unsatisfiable') {
      return { unsatisfiable: true, sizeBytes };
    }
    if (parsedRange) byteRange = parsedRange;
  }

  const slice =
    byteRange != null
      ? downloaded.bytes.subarray(byteRange.start, byteRange.end + 1)
      : downloaded.bytes;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(slice);
      controller.close();
    },
  });

  return {
    stream,
    filename: document.originalFilename,
    mimeType: document.mimeType,
    sizeBytes,
    httpStatus: byteRange ? 206 : 200,
    contentRange:
      byteRange != null ? `bytes ${byteRange.start}-${byteRange.end}/${sizeBytes}` : null,
    byteRange,
  };
}
