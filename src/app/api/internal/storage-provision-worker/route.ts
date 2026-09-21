import { NextResponse } from 'next/server';
import { runStorageProvisionCycle } from '@/modules/external-storage/application/provision-batch';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

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
  const result = await runStorageProvisionCycle({ chain, rateLimitStreak });
  return NextResponse.json(result);
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
