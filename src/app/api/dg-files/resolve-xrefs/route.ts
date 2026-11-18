import { resolveInternalDrawingRevisionStorageXrefs } from '@/modules/project-plans/application/revision-storage-xref';
import type { XrefBatchItem } from '@/modules/external-storage/application/resolve-storage-xrefs-batch';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { apiRouteErrorFromUnknown, apiRouteErrorResponse } from '@/shared/errors';

export const runtime = 'nodejs';

type Body = {
  revisionId?: string;
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
    const revisionId = body.revisionId?.trim();
    const items = Array.isArray(body.items) ? body.items.filter((row) => row?.key && row?.xrefName) : [];
    if (!revisionId || items.length === 0) return apiRouteErrorResponse('errors.validationFailed', 400);

    const resolved = await runInOrgContext(session.user.id, session.activeOrganizationId, (orgContext) =>
      resolveInternalDrawingRevisionStorageXrefs(orgContext, { revisionId, items }),
    );
    return Response.json(resolved, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiRouteErrorFromUnknown(error, 'errors.unexpected');
  }
}