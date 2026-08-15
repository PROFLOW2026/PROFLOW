import { NextResponse } from 'next/server';
import { drainDurableOcrQueue } from '@/modules/ocr';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

/**
 * Durable OCR worker. Daily Vercel recovery cron (Hobby: once per day) or an
 * operator calls this with `Authorization: Bearer $CRON_SECRET`. Upload paths
 * enqueue then kick the same drain after the response — they do not bypass the queue.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  const limit = typeof body.limit === 'number' ? body.limit : undefined;
  const result = await drainDurableOcrQueue({ limit });
  return NextResponse.json(result);
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
