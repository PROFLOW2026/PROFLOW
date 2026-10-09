import { NextResponse } from 'next/server';
import { runDailyOpsWorker } from '@/modules/ops/application/daily-ops-worker';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';
import {
  inferWorkerTrigger,
  logUsageWorkerEnd,
  logUsageWorkerStart,
  measureJsonResponseBytes,
} from '@/shared/observability/runtime-usage-diag';

export const maxDuration = 300;

/**
 * Daily ops worker: expense recurrence, UWM task recurrence, task reminders,
 * storage provision recovery, material market refresh.
 * Vercel cron or an operator calls this with
 * `Authorization: Bearer $CRON_SECRET` (or OCR_WORKER_SECRET).
 *
 * Schedule: vercel.json → 06:00 UTC daily (`0 6 * * *`).
 * Sub-workers run with ≤4 concurrency (OPS-001); dg-events daily safety net included.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const trigger = inferWorkerTrigger(request);
  const startedMs = Date.now();
  logUsageWorkerStart('ops-worker', trigger);
  const payload = await runDailyOpsWorker(startedMs);
  const response = NextResponse.json(payload);
  const responseBytes = await measureJsonResponseBytes(response);
  const dgProcessed =
    payload.dgEvents && typeof payload.dgEvents === 'object' && 'processed' in payload.dgEvents
      ? (payload.dgEvents as { processed?: number }).processed
      : undefined;
  logUsageWorkerEnd('ops-worker', trigger, startedMs, {
    processed: dgProcessed,
    nextHop:
      payload.storageProvision &&
      typeof payload.storageProvision === 'object' &&
      'kicked' in payload.storageProvision &&
      (payload.storageProvision as { kicked?: boolean }).kicked === true,
    responseBytes,
  });
  return response;
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
