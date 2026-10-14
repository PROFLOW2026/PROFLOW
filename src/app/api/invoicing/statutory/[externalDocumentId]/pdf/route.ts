import { resolveStatutoryPdfBytes } from '@/modules/invoicing-integration/application/resolve-statutory-pdf';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { apiRouteErrorFromUnknown, apiRouteErrorResponse } from '@/shared/errors';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ externalDocumentId: string }> },
) {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return apiRouteErrorResponse('errors.organizationContextRequired', 403);
    }

    const { externalDocumentId } = await context.params;
    const resolved = await runInOrgContext(
      session.user.id,
      session.activeOrganizationId,
      async (orgContext) => resolveStatutoryPdfBytes(orgContext, externalDocumentId),
    );

    return new Response(Buffer.from(resolved.bytes), {
      headers: {
        'Content-Type': resolved.contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(resolved.fileName)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return apiRouteErrorFromUnknown(error, 'invoicingIntegration.errors.providerFailed');
  }
}
