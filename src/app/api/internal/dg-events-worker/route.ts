import { NextResponse } from 'next/server';
import { runDgEventsOpsWorker } from '@/modules/dg-events/application/ops-worker';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';
import {
  inferWorkerTrigger,
  logUsageWorkerEnd,
  logUsageWorkerStart,
  measureJsonResponseBytes,
} from '@/shared/observability/runtime-usage-diag';

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
  const trigger = inferWorkerTrigger(request);
  const startedMs = Date.now();
  logUsageWorkerStart('dg-events-worker', trigger);
  const result = await runDgEventsOpsWorker({ maxMs: 45_000 });
  const response = NextResponse.json(result);
  const responseBytes = await measureJsonResponseBytes(response);
  logUsageWorkerEnd('dg-events-worker', trigger, startedMs, {
    processed: result.processed,
    remaining: Math.max(0, result.claimed - result.processed),
    responseBytes,
  });
  return response;
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
