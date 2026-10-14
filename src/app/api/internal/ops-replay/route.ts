import { NextResponse } from 'next/server';
import { z } from 'zod';
import { replayOpsQueueItems } from '@/modules/ops/application/ops-replay';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import { resolveOrgContext } from '@/modules/tenancy';
import { getAdminDb, withUserContext } from '@/shared/db/client';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

const bodySchema = z.object({
  organizationId: z.string().uuid(),
  kind: z.enum(['dg_event', 'outbox']),
  ids: z.array(z.string().uuid()).min(1).max(50),
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
    return replayOpsQueueItems(context, { kind: parsed.data.kind, ids: parsed.data.ids });
  });

  return NextResponse.json(result);
}
