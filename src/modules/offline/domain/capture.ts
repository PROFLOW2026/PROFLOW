import { validateUploadConstraints } from '@/modules/documents/domain/file-rules';
import type { EnqueueDraftInput } from './types';

export class OfflineCaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineCaptureError';
  }
}

export interface CaptureFileMeta {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface CaptureDraftPayload extends Record<string, unknown> {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** Optional link to an existing entity once known online. */
  readonly ownerType?: string | null;
  readonly ownerId?: string | null;
  readonly note?: string | null;
  /** Attachment blob id in the local blob store. */
  readonly attachmentLocalId: string;
}

export function assertCaptureFileAllowed(meta: CaptureFileMeta): void {
  const result = validateUploadConstraints({
    mimeType: meta.mimeType,
    sizeBytes: meta.sizeBytes,
  });
  if (result.valid) return;
  if (result.reason === 'mime') {
    throw new OfflineCaptureError('Capture mime type is not allowed for offline drafts.');
  }
  throw new OfflineCaptureError('Capture file exceeds the offline size limit.');
}

export function buildCaptureEnqueueInput(input: {
  readonly organizationId: string;
  readonly attachmentLocalId: string;
  readonly file: CaptureFileMeta;
  readonly ownerType?: string | null;
  readonly ownerId?: string | null;
  readonly note?: string | null;
  readonly localId?: string;
}): EnqueueDraftInput<CaptureDraftPayload> {
  assertCaptureFileAllowed(input.file);

  return {
    organizationId: input.organizationId,
    kind: 'capture',
    localId: input.localId,
    payload: {
      fileName: input.file.fileName,
      mimeType: input.file.mimeType,
      sizeBytes: input.file.sizeBytes,
      ownerType: input.ownerType ?? null,
      ownerId: input.ownerId ?? null,
      note: input.note ?? null,
      attachmentLocalId: input.attachmentLocalId,
    },
  };
}
