import { getExternalDocumentDownload } from '@/modules/external-storage/server';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { apiRouteErrorFromUnknown, apiRouteErrorResponse } from '@/shared/errors';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return apiRouteErrorResponse('errors.organizationContextRequired', 403);
    }

    const { documentId } = await context.params;

    const payload = await runInOrgContext(
      session.user.id,
      session.activeOrganizationId,
      async (orgContext) => getExternalDocumentDownload(orgContext, documentId),
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
    return apiRouteErrorFromUnknown(error, 'externalStorage.errors.operationFailed');
  }
}
