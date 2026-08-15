import { NextResponse } from 'next/server';
import { drainDurableOcrQueue } from '@/modules/ocr';

function authorized(request: Request): boolean {
  const secret = process.env.OCR_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return token.length > 0 && token === secret;
}

/**
 * Durable OCR worker. Vercel cron or an operator calls this with
 * `Authorization: Bearer $OCR_WORKER_SECRET`. Upload paths only enqueue.
 */
export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
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
