import {
  getOrgStorageProviderWebUrl,
  getProjectStorageProviderWebUrl,
} from '@/modules/external-storage/server';
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
    const projectId = url.searchParams.get('projectId');

    if (!fileId) {
      return Response.json({ error: 'missing_params' }, { status: 400 });
    }
    if (scope !== 'org' && !projectId) {
      return Response.json({ error: 'missing_params' }, { status: 400 });
    }

    const payload = await runInOrgContext(
      session.user.id,
      session.activeOrganizationId,
      async (orgContext) => {
        if (scope === 'org') {
          return getOrgStorageProviderWebUrl(orgContext, { fileId });
        }
        return getProjectStorageProviderWebUrl(orgContext, { projectId: projectId!, fileId });
      },
    );

    return Response.json({ url: payload.url, filename: payload.filename });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.messageKey ?? error.message }, { status: error.status });
    }
    return Response.json({ error: 'provider_url_failed' }, { status: 500 });
  }
}
