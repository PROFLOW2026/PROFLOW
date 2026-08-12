'use client';

import {
  finalizeDocumentUploadAction,
  prepareDocumentUploadAction,
  softDeleteDocumentAction,
} from '@/modules/documents/application/document-actions';
import { uploadDocumentBytes } from '@/modules/documents/client/upload-document-bytes';
import { normalizeUploadMime } from '@/modules/documents/domain/file-rules';
import { DOCUMENT_OWNER_TYPES, type DocumentOwnerType } from '@/modules/documents/domain/types';
import type { OfflineAttachmentRecord } from './attachment-store';
import {
  OfflineSyncNotWiredError,
  type OfflineSyncTransport,
} from './sync-runner';
import type { QueuedAction, ServerTruthHint } from '../domain/types';
import {
  fetchOfflineServerTruthAction,
  submitOfflineDraftAction,
} from '../application/sync-mutations';

function isDocumentOwnerType(value: string): value is DocumentOwnerType {
  return (DOCUMENT_OWNER_TYPES as readonly string[]).includes(value);
}

/**
 * Product transport: drains queued drafts via server-validated application modules.
 * Never fabricates success. Expense creates remain draft status on the server.
 */
export function createProductSyncTransport(): OfflineSyncTransport {
  return {
    async fetchServerTruth(action: QueuedAction): Promise<ServerTruthHint | null> {
      return fetchOfflineServerTruthAction({
        kind: action.kind,
        serverId: action.serverId,
      });
    },

    async submit(
      action: QueuedAction,
      attachments: readonly OfflineAttachmentRecord[],
    ): Promise<{ readonly serverId: string; readonly serverUpdatedAt: string }> {
      if (action.kind === 'capture') {
        return submitCapture(action, attachments);
      }

      if (
        action.kind === 'expense' ||
        action.kind === 'time_entry' ||
        action.kind === 'change_request' ||
        action.kind === 'daily_log' ||
        action.kind === 'punch' ||
        action.kind === 'inspection'
      ) {
        return submitOfflineDraftAction({
          kind: action.kind,
          serverId: action.serverId,
          payload: action.payload,
          localId: action.localId,
          organizationId: action.organizationId,
          userId: action.userId,
          updatedAt: action.updatedAt,
          syncStatus: action.syncStatus,
          serverUpdatedAt: action.serverUpdatedAt,
          dedupeKey: action.dedupeKey,
        });
      }

      throw new OfflineSyncNotWiredError(`No product sync transport for kind ${action.kind}`);
    },
  };
}

async function submitCapture(
  action: QueuedAction,
  attachments: readonly OfflineAttachmentRecord[],
): Promise<{ readonly serverId: string; readonly serverUpdatedAt: string }> {
  const attachment = attachments[0];
  if (!attachment) {
    throw new Error('Capture draft has no local attachment blob to upload.');
  }

  const ownerTypeRaw =
    typeof action.payload.ownerType === 'string' ? action.payload.ownerType.trim() : '';
  const ownerId =
    typeof action.payload.ownerId === 'string' ? action.payload.ownerId.trim() : '';

  if (!ownerTypeRaw || !ownerId || !isDocumentOwnerType(ownerTypeRaw)) {
    throw new Error(
      'Capture draft needs an owner entity before sync. Set owner on the draft, then retry.',
    );
  }

  const fileName = String(action.payload.fileName ?? attachment.fileName);
  const mime = normalizeUploadMime(
    String(action.payload.mimeType ?? attachment.mimeType),
    fileName,
  );
  if (!mime.ok) {
    throw new Error('Document mime type is not allowed');
  }

  const prepared = await prepareDocumentUploadAction({
    fileName,
    mimeType: mime.mimeType,
    sizeBytes: Number(action.payload.sizeBytes ?? attachment.sizeBytes),
    ownerType: ownerTypeRaw,
    ownerId,
    label:
      typeof action.payload.note === 'string' && action.payload.note.trim()
        ? action.payload.note.trim()
        : null,
  });

  if (!prepared.documentId || !prepared.uploadUrl) {
    throw new Error(prepared.error ?? 'Document upload prepare failed');
  }

  const documentId = prepared.documentId;
  const mimeType = mime.mimeType;
  const uploaded = await uploadDocumentBytes(
    {
      uploadUrl: prepared.uploadUrl,
      uploadToken: prepared.uploadToken,
      uploadPath: prepared.uploadPath,
      uploadBucket: prepared.uploadBucket,
    },
    attachment.blob,
    { contentType: mimeType },
  );
  if (!uploaded.ok) {
    await softDeleteDocumentAction({ documentId });
    throw new Error(
      uploaded.status
        ? `Storage upload failed (${uploaded.status})`
        : 'Storage upload failed',
    );
  }

  const sizeBytes = Number(action.payload.sizeBytes ?? attachment.sizeBytes);
  const finalized = await finalizeDocumentUploadAction({
    documentId,
    sizeBytes,
  });
  if (finalized.error) {
    await softDeleteDocumentAction({ documentId });
    throw new Error(finalized.error);
  }

  const truth = await fetchOfflineServerTruthAction({
    kind: 'capture',
    serverId: documentId,
  });

  return {
    serverId: prepared.documentId,
    serverUpdatedAt: truth?.serverUpdatedAt ?? new Date().toISOString(),
  };
}
