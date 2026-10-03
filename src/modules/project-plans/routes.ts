import 'server-only';

import { requireExternalContext } from '@/modules/contractor-access';
import { completeDrawingRevisionUpload } from '@/modules/project-plans/application/manage-drawings';
import { openInternalRevisionFile } from '@/modules/project-plans/application/drawing-queries';
import {
  openExternalRevisionFile,
  openExternalSharedDocumentFile,
} from '@/modules/project-plans/application/contractor-plans';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { NotFoundError, apiRouteErrorFromUnknown } from '@/shared/errors';
import { readRequestBytes, fileResponse, fileRouteError } from '@/modules/evidence/http';
import { EVIDENCE_SIZE_LIMITS } from '@/modules/evidence';
import { projectFileDeps } from '@/modules/evidence/server';

export {
  EXTERNAL_REVISION_DOWNLOAD_PATH,
  EXTERNAL_SHARED_DOCUMENT_DOWNLOAD_PATH,
  INTERNAL_REVISION_DOWNLOAD_PATH,
} from './download-paths';

export async function handleInternalDrawingRevisionUpload(
  request: Request,
  revisionId: string,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return new Response(null, { status: 403 });
    }
    const contentType = request.headers.get('content-type');
    const bytes = await readRequestBytes(request, EVIDENCE_SIZE_LIMITS.document);
    await runInOrgContext(session.user.id, session.activeOrganizationId, (context) =>
      completeDrawingRevisionUpload(context, { revisionId, contentType, bytes }, projectFileDeps),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return fileRouteError(error);
  }
}

export async function handleInternalRevisionDownload(
  request: Request,
  revisionId: string,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return new Response(null, { status: 403 });
    }
    const file = await runInOrgContext(session.user.id, session.activeOrganizationId, (context) =>
      openInternalRevisionFile(context, { revisionId, rangeHeader: request.headers.get('range') }, projectFileDeps),
    );
    const inline = file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf';
    return fileResponse(file, inline);
  } catch (error) {
    if (error instanceof NotFoundError) return new Response(null, { status: 404 });
    return apiRouteErrorFromUnknown(error, 'externalStorage.errors.operationFailed');
  }
}

export async function handleExternalRevisionDownload(
  request: Request,
  revisionId: string,
): Promise<Response> {
  try {
    const context = await requireExternalContext();
    const file = await openExternalRevisionFile(
      context,
      { revisionId, rangeHeader: request.headers.get('range') },
      projectFileDeps,
    );
    const inline = file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf';
    return fileResponse(file, inline);
  } catch (error) {
    if (error instanceof NotFoundError) return new Response(null, { status: 404 });
    return apiRouteErrorFromUnknown(error, 'externalStorage.errors.operationFailed');
  }
}

export async function handleExternalSharedDocumentDownload(
  request: Request,
  shareId: string,
): Promise<Response> {
  try {
    const context = await requireExternalContext();
    const file = await openExternalSharedDocumentFile(
      context,
      { shareId, rangeHeader: request.headers.get('range') },
      projectFileDeps,
    );
    const inline = file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf';
    return fileResponse(file, inline);
  } catch (error) {
    if (error instanceof NotFoundError) return new Response(null, { status: 404 });
    return apiRouteErrorFromUnknown(error, 'externalStorage.errors.operationFailed');
  }
}
