import { NextResponse } from 'next/server';
import { runStorageProvisionCycle } from '@/modules/external-storage/application/provision-batch';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

/** Allow a full first provision batch (clients + projects) before timeout. */
export const maxDuration = 300;

/**
 * Resumable external-storage folder provisioning.
 * Each call handles one batch, then chains the next request when work remains.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    chain?: unknown;
    rateLimitStreak?: unknown;
  };
  const chain = typeof body.chain === 'number' ? body.chain : 0;
  const rateLimitStreak = typeof body.rateLimitStreak === 'number' ? body.rateLimitStreak : 0;
  console.info('[org-storage/provision] worker POST begin', { chain, rateLimitStreak });
  try {
    const result = await runStorageProvisionCycle({ chain, rateLimitStreak });
    console.info('[org-storage/provision] worker POST done', {
      clientsProcessed: result.clientsProcessed,
      projectsProcessed: result.projectsProcessed,
      remaining: result.remaining,
      rateLimited: result.rateLimited,
      continued: result.continued,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[org-storage/provision] worker POST failed', {
      detail: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'provision_failed' },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
