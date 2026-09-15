import {
  streamOrgStorageFileDownload,
  streamProjectStorageFileDownload,
} from '@/modules/external-storage/server';
import {
  buildContentDisposition,
  buildContentRange,
} from '@/modules/external-storage/server/byte-range';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return Response.json({ error: 'no_active_organization' }, { status: 403 });
    }

    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') ?? 'project';
    const fileId = url.searchParams.get('fileId');
    const dispositionParam = url.searchParams.get('disposition');
    const disposition = dispositionParam === 'attachment' ? 'attachment' : 'inline';
    const projectId = url.searchParams.get('projectId');
    const rangeHeader = request.headers.get('range');

    if (!fileId) {
      return Response.json({ error: 'missing_params' }, { status: 400 });
    }
    if (scope !== 'org' && !projectId) {
      return Response.json({ error: 'missing_params' }, { status: 400 });
    }

    const payload = await runInOrgContext(
      session.user.id,
      session.activeOrganizationId,
      async (orgContext) =>
        scope === 'org'
          ? streamOrgStorageFileDownload(orgContext, { fileId, rangeHeader })
          : streamProjectStorageFileDownload(orgContext, {
              projectId: projectId!,
              fileId,
              rangeHeader,
            }),
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
    if (error instanceof AppError) {
      return Response.json({ error: error.messageKey ?? error.message }, { status: error.status });
    }
    return Response.json({ error: 'download_failed' }, { status: 500 });
  }
}
