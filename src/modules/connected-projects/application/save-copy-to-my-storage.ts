'use server';

import { z } from 'zod';
import { openExternalSharedDocumentFile } from '@/modules/project-plans';
import { projectFileDeps } from '@/modules/evidence/server';
import { finalizeDocumentUpload, prepareDocumentUpload } from '@/modules/documents';
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

export type SaveCopyToMyStorageResult =
  | { readonly ok: true; readonly documentId: string }
  | {
      readonly ok: false;
      readonly reason:
        | 'storage_not_configured'
        | 'download_not_permitted'
        | 'no_portal_principal'
        | 'upload_failed';
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

  const body = new Uint8Array(await new Response(opened.stream).arrayBuffer());
  const sizeBytes = opened.sizeBytes ?? body.byteLength;

  try {
    const documentId = await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
      const prepared = await prepareDocumentUpload(context, {
        fileName: opened.fileName,
        mimeType: opened.mimeType,
        sizeBytes,
        ownerType: 'project',
        ownerId: input.contractorProjectId,
        label: 'developer_shared_copy',
        privacyClass: 'standard',
      });

      await uploadDocumentToExternalStorage(context, {
        documentId: prepared.document.id,
        parentSemanticFolder: 'documents',
        entityType: 'project',
        entityId: input.contractorProjectId,
        fileName: opened.fileName,
        mimeType: opened.mimeType,
        body,
        sizeBytes,
      });

      await finalizeDocumentUpload(context, {
        documentId: prepared.document.id,
        sizeBytes,
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
    return { ok: false, reason: 'upload_failed' };
  }
}
