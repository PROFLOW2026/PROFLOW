import { resolveStatutoryPdfBytes } from '@/modules/invoicing-integration/application/resolve-statutory-pdf';
import { verifyStatutoryShareToken } from '@/modules/invoicing-integration/application/statutory-share-token';
import { runInOrgContext } from '@/shared/auth/session';
import { getAdminDb } from '@/shared/db/client';
import { apiRouteErrorFromUnknown } from '@/shared/errors';
import { roleAssignments, roles } from '@drizzle/schema/rbac';
import { organizationMemberships } from '@drizzle/schema/tenancy';
import { and, eq } from 'drizzle-orm';

export const runtime = 'nodejs';

async function resolveShareActorUserId(organizationId: string): Promise<string | null> {
  const db = getAdminDb();
  const [row] = await db
    .select({ userId: roleAssignments.userId })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.id, roleAssignments.membershipId),
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, 'active'),
      ),
    )
    .where(and(eq(roleAssignments.organizationId, organizationId), eq(roles.key, 'owner')))
    .limit(1);
  return row?.userId ?? null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const verified = verifyStatutoryShareToken(decodeURIComponent(token));
    const userId = await resolveShareActorUserId(verified.organizationId);
    if (!userId) {
      return new Response('Share unavailable', { status: 404 });
    }

    const url = new URL(request.url);
    const disposition = url.searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline';

    const resolved = await runInOrgContext(userId, verified.organizationId, async (orgContext) =>
      resolveStatutoryPdfBytes(orgContext, verified.externalDocumentId),
    );

    return new Response(Buffer.from(resolved.bytes), {
      headers: {
        'Content-Type': resolved.contentType,
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(resolved.fileName)}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return apiRouteErrorFromUnknown(error, 'invoicingIntegration.errors.shareInvalid');
  }
}
