import { NextResponse } from 'next/server';
import { drainSumitExpenseIngestion } from '@/modules/expense-ingestion/server';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

/**
 * Optional SUMIT expense file ingestion worker.
 * Polls enabled orgs, queues OCR, then drains the durable OCR queue.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await drainSumitExpenseIngestion();
  return NextResponse.json(result);
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
