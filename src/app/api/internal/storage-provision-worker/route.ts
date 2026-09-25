import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { runStorageProvisionCycle } from '@/modules/external-storage/application/provision-batch';
import { isStorageProvisionWorkerAuthorized } from '@/modules/external-storage/application/storage-provision-worker-auth';

/** Multi-batch provision inside waitUntil + next-hop kick. */
export const maxDuration = 300;

/**
 * Resumable external-storage folder provisioning.
 * Accepts immediately, runs multi-batch work via waitUntil (durable on Vercel),
 * then HTTP-kicks the next worker (also quick-accept) so hops do not nest.
 * Auth: STORAGE_PROVISION_WORKER_SECRET (dedicated; not OCR/CRON).
 */
export async function POST(request: Request): Promise<Response> {
  if (!isStorageProvisionWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    chain?: unknown;
    rateLimitStreak?: unknown;
    chainToken?: unknown;
  };
  const chain = typeof body.chain === 'number' ? body.chain : 0;
  const rateLimitStreak = typeof body.rateLimitStreak === 'number' ? body.rateLimitStreak : 0;
  const chainToken = typeof body.chainToken === 'string' ? body.chainToken : undefined;
  console.info('[org-storage/provision] worker POST accept', { chain, rateLimitStreak });

  waitUntil(
    runStorageProvisionCycle({ chain, rateLimitStreak, chainToken })
      .then((result) => {
        console.info('[org-storage/provision] worker waitUntil done', {
          clientsProcessed: result.clientsProcessed,
          projectsProcessed: result.projectsProcessed,
          remaining: result.remaining,
          rateLimited: result.rateLimited,
          continued: result.continued,
          fatalError: result.fatalError ?? null,
        });
      })
      .catch((error) => {
        console.error('[org-storage/provision] worker waitUntil failed', {
          detail: error instanceof Error ? error.message : String(error),
        });
      }),
  );

  return NextResponse.json({
    accepted: true,
    chain,
    rateLimitStreak,
    continued: true,
  });
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
