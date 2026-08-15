import { NextResponse } from 'next/server';
import { generateDueRecurringDrafts } from '@/modules/recurring-drafts';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

/**
 * Daily recurring-drafts worker. Vercel cron or an operator calls this with
 * `Authorization: Bearer $CRON_SECRET` (or OCR_WORKER_SECRET).
 * Generates DRAFT expense / vendor bill / billing record only.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await generateDueRecurringDrafts();
  return NextResponse.json(result);
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
