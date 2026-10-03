import 'server-only';

import { after } from 'next/server';

const DRAIN_LIMIT_MS = 20_000;

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
  void fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => undefined);
}

function kickLocal(): void {
  void import('./ops-worker')
    .then(({ runDgEventsOpsWorker }) => runDgEventsOpsWorker({ maxMs: DRAIN_LIMIT_MS }))
    .catch(() => undefined);
}

/**
 * Deliver domain-event notifications in this request, then also POST the existing
 * worker so a separate invocation can finish the batch. The daily ops worker remains
 * the recovery path. Concurrent drains are safe (SKIP LOCKED).
 */
export function scheduleDgEventDrain(): void {
  if (scheduled) return;
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') return;
  scheduled = true;
  const run = () => {
    scheduled = false;
    kickLocal();
    kickRemote();
  };
  try {
    after(run);
  } catch {
    scheduled = false;
    run();
  }
}
