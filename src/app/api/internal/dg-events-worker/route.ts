import { NextResponse } from 'next/server';
import { runDgEventsOpsWorker } from '@/modules/dg-events/application/ops-worker';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

export const maxDuration = 60;

/**
 * Developer / GC domain-event consumer. Called from the request that recorded the event
 * (`scheduleDgEventDrain`) and from the daily ops worker. Not a sub-daily Vercel cron.
 * Authorization: `Bearer $CRON_SECRET` (or OCR_WORKER_SECRET). Safe to call concurrently.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runDgEventsOpsWorker({ maxMs: 45_000 });
  return NextResponse.json(result);
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
