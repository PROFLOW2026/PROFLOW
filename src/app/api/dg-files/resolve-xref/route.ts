import {
  resolveInternalDrawingRevisionStorageXref,
  resolveExternalDrawingRevisionStorageXref,
} from '@/modules/project-plans/application/revision-storage-xref';
import { xrefApiHttpStatus } from '@/modules/external-storage/domain/xref-resolve-response';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { requireExternalContext } from '@/modules/contractor-access';
import { apiRouteErrorFromUnknown, apiRouteErrorResponse } from '@/shared/errors';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') ?? 'internal';
    const revisionId = url.searchParams.get('revisionId');
    const xrefPath = url.searchParams.get('path');
    const anchorPath = url.searchParams.get('anchor');
    if (!revisionId || !xrefPath) return apiRouteErrorResponse('errors.validationFailed', 400);

    const body =
      scope === 'contractor'
        ? await (async () => {
            const context = await requireExternalContext();
            return resolveExternalDrawingRevisionStorageXref(context, { revisionId, xrefPath, anchorPath });
          })()
        : await (async () => {
            const session = await requireSession();
            if (!session.activeOrganizationId) {
              return apiRouteErrorResponse('errors.organizationContextRequired', 403);
            }
            return runInOrgContext(session.user.id, session.activeOrganizationId, (orgContext) =>
              resolveInternalDrawingRevisionStorageXref(orgContext, { revisionId, xrefPath, anchorPath }),
            );
          })();

    if (body instanceof Response) return body;
    return Response.json(body, {
      status: xrefApiHttpStatus(body),
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return apiRouteErrorFromUnknown(error, 'errors.unexpected');
  }
}