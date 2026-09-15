import {
  getOrgStorageFileDownload,
  getOrgStorageFileDownloadMeta,
  getProjectStorageFileDownload,
  getProjectStorageFileDownloadMeta,
} from '@/modules/external-storage/server';
import {
  buildContentDisposition,
  buildContentRange,
  parseByteRangeHeader,
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

    if (!fileId) {
      return Response.json({ error: 'missing_params' }, { status: 400 });
    }
    if (scope !== 'org' && !projectId) {
      return Response.json({ error: 'missing_params' }, { status: 400 });
    }

    const rangeHeader = request.headers.get('range');

    const payload = await runInOrgContext(
      session.user.id,
      session.activeOrganizationId,
      async (orgContext) => {
        const meta =
          scope === 'org'
            ? await getOrgStorageFileDownloadMeta(orgContext, { fileId })
            : await getProjectStorageFileDownloadMeta(orgContext, {
                projectId: projectId!,
                fileId,
              });

        let byteRange: { start: number; end: number } | null = null;
        if (rangeHeader) {
          const parsed = parseByteRangeHeader(rangeHeader, meta.sizeBytes ?? 0);
          if (parsed === 'unsatisfiable') {
            return { unsatisfiable: true as const, sizeBytes: meta.sizeBytes };
          }
          if (parsed) byteRange = parsed;
        }

        const downloaded =
          scope === 'org'
            ? await getOrgStorageFileDownload(orgContext, { fileId, byteRange })
            : await getProjectStorageFileDownload(orgContext, {
                projectId: projectId!,
                fileId,
                byteRange,
              });

        return { ...downloaded, byteRange };
      },
    );

    if ('unsatisfiable' in payload && payload.unsatisfiable) {
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
