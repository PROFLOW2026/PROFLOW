import { resolveSumitImportPdfBytes } from '@/modules/expense-ingestion/server';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { apiRouteErrorFromUnknown, apiRouteErrorResponse } from '@/shared/errors';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ importId: string }> },
) {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return apiRouteErrorResponse('errors.organizationContextRequired', 403);
    }

    const { importId } = await context.params;
    const url = new URL(request.url);
    const disposition =
      url.searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline';

    const resolved = await runInOrgContext(
      session.user.id,
      session.activeOrganizationId,
      async (orgContext) => resolveSumitImportPdfBytes(orgContext, importId),
    );

    return new Response(Buffer.from(resolved.bytes), {
      headers: {
        'Content-Type': resolved.contentType,
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(resolved.fileName)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return apiRouteErrorFromUnknown(error, 'expenses.received.errors.pdfFailed');
  }
}
