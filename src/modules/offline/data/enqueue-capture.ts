import {
  buildCaptureEnqueueInput,
  type CaptureDraftPayload,
} from '../domain/capture';
import type { OfflineDraftRecord } from '../domain/types';
import {
  createAttachmentLocalId,
  getDefaultAttachmentStore,
  type AttachmentStore,
  type OfflineAttachmentRecord,
} from './attachment-store';
import { createDraftQueue, getDraftQueue, type DraftQueue } from './draft-queue';
import { mirrorDraftsToLocalStorage } from './queue-index';

export interface EnqueueCaptureInput {
  readonly organizationId: string;
  readonly file: File | Blob;
  readonly fileName: string;
  readonly mimeType?: string;
  readonly ownerType?: string | null;
  readonly ownerId?: string | null;
  readonly note?: string | null;
  readonly localId?: string;
}

/**
 * Persist a photo/document capture as an offline draft + IndexedDB blob.
 * Does not upload; reconnect sync + transport owner handle the network path.
 */
export async function enqueueCaptureDraft(
  input: EnqueueCaptureInput,
  deps: {
    readonly queue?: DraftQueue;
    readonly attachments?: AttachmentStore;
  } = {},
): Promise<{
  readonly draft: OfflineDraftRecord<CaptureDraftPayload>;
  readonly attachment: OfflineAttachmentRecord;
}> {
  const queue = deps.queue ?? getDraftQueue();
  const attachments = deps.attachments ?? getDefaultAttachmentStore();

  const mimeType =
    input.mimeType ??
    (input.file instanceof File && input.file.type ? input.file.type : 'application/octet-stream');
  const sizeBytes = input.file.size;
  const attachmentLocalId = createAttachmentLocalId();
  const draftLocalId = input.localId ?? createAttachmentLocalId();

  const enqueueInput = buildCaptureEnqueueInput({
    organizationId: input.organizationId,
    attachmentLocalId,
    localId: draftLocalId,
    file: {
      fileName: input.fileName,
      mimeType,
      sizeBytes,
    },
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    note: input.note,
  });

  const draft = await queue.enqueue(enqueueInput);

  const attachment: OfflineAttachmentRecord = {
    localId: attachmentLocalId,
    organizationId: input.organizationId,
    draftLocalId: draft.localId,
    fileName: input.fileName,
    mimeType,
    sizeBytes,
    createdAt: new Date().toISOString(),
    blob: input.file,
  };
  await attachments.put(attachment);

  const all = await queue.list({ organizationId: input.organizationId, pendingOnly: false });
  mirrorDraftsToLocalStorage(all);

  return {
    draft: draft as OfflineDraftRecord<CaptureDraftPayload>,
    attachment,
  };
}

/** Convenience: default queue factory for callers that inject memory stores in tests. */
export function createOfflinePersistence(deps: {
  readonly queue?: DraftQueue;
  readonly attachments?: AttachmentStore;
}) {
  return {
    queue: deps.queue ?? createDraftQueue(),
    attachments: deps.attachments ?? getDefaultAttachmentStore(),
  };
}
