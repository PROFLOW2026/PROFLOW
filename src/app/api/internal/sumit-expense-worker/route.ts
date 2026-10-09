import { NextResponse } from 'next/server';
import { drainSumitExpenseIngestion } from '@/modules/expense-ingestion/server';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';
import {
  inferWorkerTrigger,
  logUsageWorkerEnd,
  logUsageWorkerStart,
  measureJsonResponseBytes,
} from '@/shared/observability/runtime-usage-diag';

/**
 * Optional SUMIT expense file ingestion worker.
 * Polls enabled orgs, queues OCR, then drains the durable OCR queue.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const trigger = inferWorkerTrigger(request);
  const startedMs = Date.now();
  logUsageWorkerStart('sumit-expense-worker', trigger);
  const result = await drainSumitExpenseIngestion();
  const response = NextResponse.json(result);
  const responseBytes = await measureJsonResponseBytes(response);
  logUsageWorkerEnd('sumit-expense-worker', trigger, startedMs, { responseBytes });
  return response;
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
