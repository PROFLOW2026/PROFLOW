'use client';

import {
  finalizeDocumentUploadAction,
  prepareDocumentUploadAction,
} from '@/modules/documents/application/document-actions';
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
        action.kind === 'daily_log'
      ) {
        return submitOfflineDraftAction({
          kind: action.kind,
          serverId: action.serverId,
          payload: action.payload,
          localId: action.localId,
          organizationId: action.organizationId,
          updatedAt: action.updatedAt,
          syncStatus: action.syncStatus,
          serverUpdatedAt: action.serverUpdatedAt,
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

  const prepared = await prepareDocumentUploadAction({
    fileName: String(action.payload.fileName ?? attachment.fileName),
    mimeType: String(action.payload.mimeType ?? attachment.mimeType),
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

  const uploadResponse = await fetch(prepared.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': String(action.payload.mimeType ?? attachment.mimeType),
    },
    body: attachment.blob,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Storage upload failed (${uploadResponse.status})`);
  }

  const sizeBytes = Number(action.payload.sizeBytes ?? attachment.sizeBytes);
  const finalized = await finalizeDocumentUploadAction({
    documentId: prepared.documentId,
    sizeBytes,
  });
  if (finalized.error) {
    throw new Error(finalized.error);
  }

  const truth = await fetchOfflineServerTruthAction({
    kind: 'capture',
    serverId: prepared.documentId,
  });

  return {
    serverId: prepared.documentId,
    serverUpdatedAt: truth?.serverUpdatedAt ?? new Date().toISOString(),
  };
}
