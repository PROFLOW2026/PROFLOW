import { streamDocumentContent } from '@/modules/documents/application/stream-document-content';
import {
  buildContentDisposition,
  buildContentRange,
} from '@/modules/external-storage/server/byte-range';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { apiRouteErrorFromUnknown, apiRouteErrorResponse } from '@/shared/errors';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return apiRouteErrorResponse('errors.organizationContextRequired', 403);
    }

    const { documentId } = await context.params;
    const url = new URL(request.url);
    const disposition = url.searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline';
    const rangeHeader = request.headers.get('range');

    const payload = await runInOrgContext(
      session.user.id,
      session.activeOrganizationId,
      async (orgContext) =>
        streamDocumentContent(orgContext, { documentId, rangeHeader }),
    );

    if ('unsatisfiable' in payload) {
      const total = payload.sizeBytes ?? '*';
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}` },
      });
    }

    const isPartial = payload.byteRange !== null && payload.httpStatus === 206;
    const headers: Record<string, string> = {
      'Content-Type': payload.mimeType,
      'Content-Disposition': buildContentDisposition(payload.filename, disposition),
      'Cache-Control': 'private, no-store',
    };

    if (payload.sizeBytes != null) {
      headers['Accept-Ranges'] = 'bytes';
      if (!isPartial) {
        headers['Content-Length'] = String(payload.sizeBytes);
      }
    }

    if (isPartial && payload.byteRange && payload.sizeBytes != null) {
      headers['Content-Range'] =
        payload.contentRange ??
        buildContentRange(payload.byteRange.start, payload.byteRange.end, payload.sizeBytes);
      headers['Content-Length'] = String(payload.byteRange.end - payload.byteRange.start + 1);
    }

    return new Response(payload.stream, {
      status: isPartial ? 206 : 200,
      headers,
    });
  } catch (error) {
    return apiRouteErrorFromUnknown(error, 'externalStorage.errors.operationFailed');
  }
}
