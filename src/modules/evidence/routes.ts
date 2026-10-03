import 'server-only';

import { requireExternalContext } from '@/modules/contractor-access';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { NotFoundError, apiRouteErrorFromUnknown } from '@/shared/errors';
import { readRequestBytes, fileResponse, fileRouteError } from './http';
import { completeExternalEvidenceUpload, completeInternalEvidenceUpload } from './application/upload-evidence';
import { EVIDENCE_SIZE_LIMITS } from './domain/file-policy';
import { openExternalEvidenceFile, openInternalEvidenceFile } from './application/list-evidence';
import { projectFileDeps } from './server';

export const INTERNAL_EVIDENCE_DOWNLOAD_PATH = '/api/dg-files/download/evidence';
export const EXTERNAL_EVIDENCE_DOWNLOAD_PATH = '/api/contractor/dg-files/download/evidence';

function maxBytesForContentType(contentType: string | null): number {
  const mime = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  if (mime.startsWith('video/')) return EVIDENCE_SIZE_LIMITS.video;
  if (mime === 'application/pdf' || mime.includes('document') || mime.includes('sheet')) {
    return EVIDENCE_SIZE_LIMITS.document;
  }
  return EVIDENCE_SIZE_LIMITS.photo;
}

export async function handleInternalEvidenceUpload(
  request: Request,
  evidenceId: string,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return new Response(null, { status: 403 });
    }
    const contentType = request.headers.get('content-type');
    const bytes = await readRequestBytes(request, maxBytesForContentType(contentType));
    await runInOrgContext(session.user.id, session.activeOrganizationId, (context) =>
      completeInternalEvidenceUpload(
        context,
        { evidenceId, contentType, bytes },
        projectFileDeps,
      ),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return fileRouteError(error);
  }
}

export async function handleExternalEvidenceUpload(
  request: Request,
  evidenceId: string,
): Promise<Response> {
  try {
    const context = await requireExternalContext();
    const contentType = request.headers.get('content-type');
    const bytes = await readRequestBytes(request, maxBytesForContentType(contentType));
    await completeExternalEvidenceUpload(
      context,
      { evidenceId, contentType, bytes },
      projectFileDeps,
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return fileRouteError(error);
  }
}

export async function handleInternalEvidenceDownload(
  request: Request,
  evidenceId: string,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return new Response(null, { status: 403 });
    }
    const file = await runInOrgContext(session.user.id, session.activeOrganizationId, (context) =>
      openInternalEvidenceFile(
        context,
        { evidenceId, rangeHeader: request.headers.get('range') },
        projectFileDeps,
      ),
    );
    const inline = file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/') || file.mimeType === 'application/pdf';
    return fileResponse(file, inline);
  } catch (error) {
    if (error instanceof NotFoundError) return new Response(null, { status: 404 });
    return apiRouteErrorFromUnknown(error, 'externalStorage.errors.operationFailed');
  }
}

export async function handleExternalEvidenceDownload(
  request: Request,
  evidenceId: string,
): Promise<Response> {
  try {
    const context = await requireExternalContext();
    const file = await openExternalEvidenceFile(
      context,
      { evidenceId, rangeHeader: request.headers.get('range') },
      projectFileDeps,
    );
    const inline = file.mimeType.startsWith('image/') || file.mimeType.startsWith('video/') || file.mimeType === 'application/pdf';
    return fileResponse(file, inline);
  } catch (error) {
    if (error instanceof NotFoundError) return new Response(null, { status: 404 });
    return apiRouteErrorFromUnknown(error, 'externalStorage.errors.operationFailed');
  }
}
