import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { runStorageProvisionCycle } from '@/modules/external-storage/application/provision-batch';
import { isStorageProvisionWorkerAuthorized } from '@/modules/external-storage/application/storage-provision-worker-auth';

/** Allow multi-batch provision + next-hop kick within one invocation. */
export const maxDuration = 300;

/**
 * Resumable external-storage folder provisioning.
 * Accepts immediately, then runs the batch cycle in `after()` so HTTP chaining
 * does not nest under a single open request.
 * Auth: STORAGE_PROVISION_WORKER_SECRET (dedicated; not OCR/CRON).
 */
export async function POST(request: Request): Promise<Response> {
  if (!isStorageProvisionWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    chain?: unknown;
    rateLimitStreak?: unknown;
  };
  const chain = typeof body.chain === 'number' ? body.chain : 0;
  const rateLimitStreak = typeof body.rateLimitStreak === 'number' ? body.rateLimitStreak : 0;
  console.info('[org-storage/provision] worker POST accept', { chain, rateLimitStreak });

  after(() => {
    void runStorageProvisionCycle({ chain, rateLimitStreak })
      .then((result) => {
        console.info('[org-storage/provision] worker after done', {
          clientsProcessed: result.clientsProcessed,
          projectsProcessed: result.projectsProcessed,
          remaining: result.remaining,
          rateLimited: result.rateLimited,
          continued: result.continued,
          fatalError: result.fatalError ?? null,
        });
      })
      .catch((error) => {
        console.error('[org-storage/provision] worker after failed', {
          detail: error instanceof Error ? error.message : String(error),
        });
      });
  });

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
