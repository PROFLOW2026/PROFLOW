import { AuthorizationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { normalizeUploadMime } from '../domain/file-rules';
import type { DocumentOwnerType } from '../domain/types';
import { prepareDocumentUpload } from './upload-document';
import { finalizeDocumentUpload, softDeleteDocument } from './manage-document';
import { putBytesToSignedUploadUrl } from './put-signed-upload';

export interface AttachFilesToOwnerInput {
  readonly ownerType: DocumentOwnerType;
  readonly ownerId: string;
  readonly files: readonly File[];
}

export interface AttachFilesToOwnerResult {
  readonly attached: number;
  readonly failed: number;
}

/**
 * After an owner row exists: prepare → private signed PUT → finalize.
 * Requires documents.manage. Failed uploads are soft-deleted (no orphan pending docs).
 */
export async function attachFilesToOwner(
  context: OrgContext,
  input: AttachFilesToOwnerInput,
): Promise<AttachFilesToOwnerResult> {
  if (input.files.length === 0) {
    return { attached: 0, failed: 0 };
  }

  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  let attached = 0;
  let failed = 0;

  for (const file of input.files) {
    const mime = normalizeUploadMime(file.type, file.name);
    if (!mime.ok) {
      failed += 1;
      continue;
    }

    let documentId: string | undefined;
    try {
      const prepared = await prepareDocumentUpload(context, {
        fileName: file.name,
        mimeType: mime.mimeType,
        sizeBytes: file.size,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
      });
      documentId = prepared.document.id;

      const uploaded = await putBytesToSignedUploadUrl(
        prepared.uploadUrl,
        file,
        mime.mimeType,
      );
      if (!uploaded.ok) {
        await softDeleteDocument(context, { documentId });
        failed += 1;
        continue;
      }

      await finalizeDocumentUpload(context, {
        documentId,
        sizeBytes: file.size,
      });
      attached += 1;
    } catch {
      if (documentId) {
        try {
          await softDeleteDocument(context, { documentId });
        } catch {
          // Metadata cleanup is best-effort; the owner record stays.
        }
      }
      failed += 1;
    }
  }

  return { attached, failed };
}

/** Call before creating the owner row so a missing documents.manage does not leave an orphan record + failed photos. */
export function assertCanAttachCreatePhotos(context: OrgContext, fileCount: number): void {
  if (fileCount <= 0) return;
  if (!hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE)) {
    throw new AuthorizationError(PERMISSIONS.DOCUMENTS_MANAGE);
  }
}
