import {
  resolveOrgStorageXrefDetailed,
  resolveProjectStorageXrefDetailed,
  xrefApiHttpStatus,
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
    const xrefPath = url.searchParams.get('path');
    const projectId = url.searchParams.get('projectId');
    const anchorPath = url.searchParams.get('anchor');
    if (!fileId || !xrefPath) return apiRouteErrorResponse('errors.validationFailed', 400);
    if (scope !== 'org' && !projectId) return apiRouteErrorResponse('errors.validationFailed', 400);

    const body = await runInOrgContext(session.user.id, session.activeOrganizationId, async (orgContext) =>
      scope === 'org'
        ? resolveOrgStorageXrefDetailed(orgContext, { hostFileId: fileId, xrefPath, anchorPath })
        : resolveProjectStorageXrefDetailed(orgContext, {
            projectId: projectId!,
            hostFileId: fileId,
            xrefPath,
            anchorPath,
          }),
    );
    return Response.json(body, {
      status: xrefApiHttpStatus(body),
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return apiRouteErrorFromUnknown(error, 'errors.unexpected');
  }
}
