import { uploadDocumentToExternalStorage } from '@/modules/external-storage/server';
import type { SemanticFolderType } from '@/modules/external-storage/server';
import { findDocumentById } from '@/modules/documents';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { AppError, NotFoundError } from '@/shared/errors';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return Response.json({ error: 'no_active_organization' }, { status: 403 });
    }

    const { documentId } = await context.params;
    const url = new URL(request.url);
    const semantic = (url.searchParams.get('semantic') ?? 'general_files') as SemanticFolderType;
    const entityType = url.searchParams.get('entityType');
    const entityId = url.searchParams.get('entityId');
    const versionNumber = url.searchParams.get('versionNumber');
    const parentFolderId = url.searchParams.get('parentFolderId');

    const contentType = request.headers.get('content-type') ?? 'application/octet-stream';
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (!request.body || !contentLength) {
      return Response.json({ error: 'empty_body' }, { status: 400 });
    }

    const result = await runInOrgContext(
      session.user.id,
      session.activeOrganizationId,
      async (orgContext) => {
        const document = await findDocumentById(orgContext.db, orgContext.organizationId, documentId);
        if (!document) {
          throw new NotFoundError('Document');
        }

        if (versionNumber) {
          const { uploadDocumentVersionToExternalStorage } = await import(
            '@/modules/external-storage/application/version-upload'
          );
          return uploadDocumentVersionToExternalStorage(orgContext, {
            documentId,
            versionNumber: Number(versionNumber),
            fileName: url.searchParams.get('fileName') ?? document.originalFilename,
            mimeType: contentType,
            body: request.body!,
            sizeBytes: contentLength,
          });
        }

        if (document.status !== 'pending') {
          throw new NotFoundError('Document');
        }

        return uploadDocumentToExternalStorage(orgContext, {
          documentId,
          parentSemanticFolder: semantic,
          entityType,
          entityId,
          parentFolderExternalId: parentFolderId,
          fileName: document.originalFilename,
          mimeType: contentType,
          body: request.body!,
          sizeBytes: contentLength,
        });
      },
    );

    return Response.json({ ok: true, externalFileId: result.id });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.messageKey ?? error.message }, { status: error.status });
    }
    const messageKey =
      error instanceof Error && 'messageKey' in error
        ? String((error as { messageKey?: string }).messageKey)
        : 'upload_failed';
    return Response.json({ error: messageKey }, { status: 500 });
  }
}
