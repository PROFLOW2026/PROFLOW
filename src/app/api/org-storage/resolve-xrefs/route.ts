import {
  resolveOrgStorageXrefs,
  resolveProjectStorageXrefs,
  xrefApiHttpStatus,
} from '@/modules/external-storage/server';
import type { XrefBatchItem } from '@/modules/external-storage/application/resolve-storage-xrefs-batch';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { apiRouteErrorFromUnknown, apiRouteErrorResponse } from '@/shared/errors';

export const runtime = 'nodejs';

type Body = {
  scope?: 'project' | 'org';
  fileId?: string;
  projectId?: string;
  items?: XrefBatchItem[];
};

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return apiRouteErrorResponse('errors.organizationContextRequired', 403);
    }
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return apiRouteErrorResponse('errors.validationFailed', 400);
    }
    const scope = body.scope ?? 'project';
    const fileId = body.fileId?.trim();
    const projectId = body.projectId?.trim();
    const items = Array.isArray(body.items) ? body.items.filter((row) => row?.key && row?.xrefName) : [];
    if (!fileId || items.length === 0) return apiRouteErrorResponse('errors.validationFailed', 400);
    if (scope !== 'org' && !projectId) return apiRouteErrorResponse('errors.validationFailed', 400);

    const resolved = await runInOrgContext(session.user.id, session.activeOrganizationId, async (orgContext) =>
      scope === 'org'
        ? resolveOrgStorageXrefs(orgContext, { hostFileId: fileId, items })
        : resolveProjectStorageXrefs(orgContext, { projectId: projectId!, hostFileId: fileId, items }),
    );
    return Response.json(resolved, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiRouteErrorFromUnknown(error, 'errors.unexpected');
  }
}
