import { resolveStatutoryPdfBytes } from '@/modules/invoicing-integration/application/resolve-statutory-pdf';
import {
  resolveStatutoryShareAccess,
  touchStatutoryShareAccess,
} from '@/modules/invoicing-integration/application/resolve-statutory-share-access';
import { runInOrgContext } from '@/shared/auth/session';

export const runtime = 'nodejs';

function statutoryShareNotFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const access = await resolveStatutoryShareAccess(decodeURIComponent(token));
  if (!access) {
    return statutoryShareNotFound();
  }

  try {
    const resolved = await runInOrgContext(
      access.createdByUserId,
      access.organizationId,
      async (orgContext) => resolveStatutoryPdfBytes(orgContext, access.externalDocumentId),
    );

    await touchStatutoryShareAccess(access.organizationId, access.linkId);

    return new Response(Buffer.from(resolved.bytes), {
      headers: {
        'Content-Type': resolved.contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(resolved.fileName)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return statutoryShareNotFound();
  }
}
