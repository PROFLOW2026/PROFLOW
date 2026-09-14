import { getProjectStorageFileDownload } from '@/modules/external-storage/server';
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
    const projectId = url.searchParams.get('projectId');
    const fileId = url.searchParams.get('fileId');
    if (!projectId || !fileId) {
      return Response.json({ error: 'missing_params' }, { status: 400 });
    }

    const payload = await runInOrgContext(
      session.user.id,
      session.activeOrganizationId,
      async (orgContext) => getProjectStorageFileDownload(orgContext, { projectId, fileId }),
    );

    if ('url' in payload) {
      return Response.redirect(payload.url, 302);
    }

    return new Response(payload.stream, {
      headers: {
        'Content-Type': payload.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(payload.filename)}"`,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.messageKey ?? error.message }, { status: error.status });
    }
    return Response.json({ error: 'download_failed' }, { status: 500 });
  }
}
