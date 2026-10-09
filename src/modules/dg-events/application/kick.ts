import 'server-only';

import { after } from 'next/server';
import { logUsageSelfHttp } from '@/shared/observability/runtime-usage-diag';

let scheduled = false;

function workerUrl(): string | null {
  const base =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/api/internal/dg-events-worker`;
}

function kickRemote(): void {
  const secret = process.env.CRON_SECRET?.trim() || process.env.OCR_WORKER_SECRET?.trim();
  const url = workerUrl();
  if (!secret || !url) return;
  logUsageSelfHttp({
    fromModule: 'dg-events/kick',
    toPath: '/api/internal/dg-events-worker',
    reason: 'emit_domain_event',
  });
  void fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => undefined);
}

/**
 * After a domain event is written, POST the internal worker once (non-blocking).
 * The daily ops worker remains the recovery path. Concurrent drains are safe (SKIP LOCKED).
 */
export function scheduleDgEventDrain(): void {
  if (scheduled) return;
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') return;
  scheduled = true;
  const run = () => {
    scheduled = false;
    kickRemote();
  };
  try {
    after(run);
  } catch {
    scheduled = false;
    run();
  }
}
