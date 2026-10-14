'use server';

import { z } from 'zod';
import { openExternalSharedDocumentFile } from '@/modules/project-plans';
import { projectFileDeps } from '@/modules/evidence/server';
import { finalizeDocumentUpload, prepareDocumentUpload, softDeleteDocument } from '@/modules/documents';
import { isOrganizationStorageConfigured, uploadDocumentToExternalStorage } from '@/modules/external-storage/server';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { withOrgContext } from '@/shared/auth/session';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { requireConnectedDeveloperSession } from './require-connected-developer-context';

const inputSchema = z.object({
  contractorProjectId: z.string().uuid(),
  shareId: z.string().uuid(),
});

/** OD-70: cap cross-org copy before reading the full stream into memory. */
export const CROSS_ORG_COPY_MAX_BYTES = 50 * 1024 * 1024;

export type SaveCopyToMyStorageResult =
  | { readonly ok: true; readonly documentId: string }
  | {
      readonly ok: false;
      readonly reason:
        | 'storage_not_configured'
        | 'download_not_permitted'
        | 'no_portal_principal'
        | 'upload_failed'
        | 'too_large';
    };

/**
 * Explicit opt-in copy from developer shared document into contractor org storage.
 * No automatic copy; no cross-storage sync (Owner correction A).
 */
export async function saveCopyToMyStorageAction(
  raw: z.input<typeof inputSchema>,
): Promise<SaveCopyToMyStorageResult> {
  const input = inputSchema.parse(raw);
  const session = await requireConnectedDeveloperSession(input.contractorProjectId, EXTERNAL_CAPABILITIES.DOCUMENT_VIEW);
  if (!session.externalContext) {
    return { ok: false, reason: 'no_portal_principal' };
  }

  const storageReady = await withOrgContext((org) => isOrganizationStorageConfigured(org));
  if (!storageReady) {
    return { ok: false, reason: 'storage_not_configured' };
  }

  let opened: Awaited<ReturnType<typeof openExternalSharedDocumentFile>>;
  try {
    opened = await openExternalSharedDocumentFile(
      session.externalContext,
      { shareId: input.shareId },
      projectFileDeps,
    );
  } catch {
    return { ok: false, reason: 'download_not_permitted' };
  }

  const sizeBytes = opened.sizeBytes;
  if (sizeBytes != null && sizeBytes > CROSS_ORG_COPY_MAX_BYTES) {
    return { ok: false, reason: 'too_large' };
  }

  const body = new Uint8Array(await new Response(opened.stream).arrayBuffer());
  const resolvedSize = sizeBytes ?? body.byteLength;
  if (resolvedSize > CROSS_ORG_COPY_MAX_BYTES) {
    return { ok: false, reason: 'too_large' };
  }

  let preparedDocumentId: string | null = null;
  try {
    const documentId = await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
      const prepared = await prepareDocumentUpload(context, {
        fileName: opened.fileName,
        mimeType: opened.mimeType,
        sizeBytes: resolvedSize,
        ownerType: 'project',
        ownerId: input.contractorProjectId,
        label: 'developer_shared_copy',
        privacyClass: 'standard',
      });
      preparedDocumentId = prepared.document.id;

      await uploadDocumentToExternalStorage(context, {
        documentId: prepared.document.id,
        parentSemanticFolder: 'documents',
        entityType: 'project',
        entityId: input.contractorProjectId,
        fileName: opened.fileName,
        mimeType: opened.mimeType,
        body,
        sizeBytes: resolvedSize,
      });

      await finalizeDocumentUpload(context, {
        documentId: prepared.document.id,
        sizeBytes: resolvedSize,
      });

      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.CONNECTED_PROJECT_DOCUMENT_COPY_SAVED,
        entityType: 'document',
        entityId: prepared.document.id,
        after: {
          shareId: input.shareId,
          contractorProjectId: input.contractorProjectId,
          developerProjectId: session.developer.projectId,
        },
      });

      return prepared.document.id;
    });

    return { ok: true, documentId };
  } catch {
    if (preparedDocumentId) {
      try {
        await withOrgContext((context) => softDeleteDocument(context, { documentId: preparedDocumentId! }));
      } catch {
        // Best-effort orphan cleanup.
      }
    }
    return { ok: false, reason: 'upload_failed' };
  }
}
