import { NextResponse } from 'next/server';
import { z } from 'zod';
import { retryFailedDocumentCleanups } from '@/modules/documents/application/manage-document';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import { getAdminDb, withUserContext } from '@/shared/db/client';
import { resolveOrgContext } from '@/modules/tenancy';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

const bodySchema = z.object({
  organizationId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request, 'ops-worker')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const db = getAdminDb();
  const owner = await findActiveOrgOwnerUserId(db, parsed.data.organizationId);
  if (!owner) {
    return NextResponse.json({ error: 'no_org_owner' }, { status: 404 });
  }

  const result = await withUserContext(owner.userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: owner.userId,
      organizationId: parsed.data.organizationId,
      locale: 'he-IL',
    });
    return retryFailedDocumentCleanups(context, { documentIds: parsed.data.documentIds });
  });

  return NextResponse.json(result);
}
