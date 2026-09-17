import {
  getOrgStorageProviderWebUrl,
  getProjectStorageProviderWebUrl,
} from '@/modules/external-storage/server';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { apiRouteErrorFromUnknown, apiRouteErrorResponse } from '@/shared/errors';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return apiRouteErrorResponse('errors.organizationContextRequired', 403);
    }

    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') ?? 'project';
    const fileId = url.searchParams.get('fileId');
    const projectId = url.searchParams.get('projectId');

    if (!fileId) {
      return apiRouteErrorResponse('errors.validationFailed', 400);
    }
    if (scope !== 'org' && !projectId) {
      return apiRouteErrorResponse('errors.validationFailed', 400);
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
    return apiRouteErrorFromUnknown(error, 'externalStorage.errors.operationFailed');
  }
}
