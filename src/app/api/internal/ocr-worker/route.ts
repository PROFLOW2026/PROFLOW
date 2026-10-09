import { NextResponse } from 'next/server';
import { drainDurableOcrQueue } from '@/modules/ocr';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';
import {
  inferWorkerTrigger,
  logUsageWorkerEnd,
  logUsageWorkerStart,
  measureJsonResponseBytes,
} from '@/shared/observability/runtime-usage-diag';

/**
 * Durable OCR worker. Daily Vercel recovery cron (Hobby: once per day) or an
 * operator calls this with `Authorization: Bearer $CRON_SECRET`. Upload paths
 * enqueue then kick the same drain after the response - they do not bypass the queue.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const trigger = inferWorkerTrigger(request);
  const startedMs = Date.now();
  logUsageWorkerStart('ocr-worker', trigger);
  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  const limit = typeof body.limit === 'number' ? body.limit : undefined;
  const result = await drainDurableOcrQueue({ limit });
  const response = NextResponse.json(result);
  const responseBytes = await measureJsonResponseBytes(response);
  logUsageWorkerEnd('ocr-worker', trigger, startedMs, {
    processed: typeof result.processed === 'number' ? result.processed : undefined,
    remaining: typeof result.claimed === 'number' ? Math.max(0, result.claimed - (result.processed ?? 0)) : undefined,
    responseBytes,
  });
  return response;
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
