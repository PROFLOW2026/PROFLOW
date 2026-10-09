import 'server-only';

import { after } from 'next/server';
import { logUsageKickFailure, logUsageSelfHttp } from '@/shared/observability/runtime-usage-diag';

let scheduled = false;
const KICK_DEBOUNCE_MS = 60_000;
let lastRemoteKickAt = 0;

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
  const now = Date.now();
  if (now - lastRemoteKickAt < KICK_DEBOUNCE_MS) return;
  lastRemoteKickAt = now;
  logUsageSelfHttp({
    fromModule: 'dg-events/kick',
    toPath: '/api/internal/dg-events-worker',
    reason: 'emit_domain_event',
  });
  void fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  }).catch((error) => {
    logUsageKickFailure({
      fromModule: 'dg-events/kick',
      toPath: '/api/internal/dg-events-worker',
      reason: 'emit_domain_event',
      detail: error instanceof Error ? error.message : String(error),
    });
  });
}

/**
 * After a domain event is written, POST the internal worker once (non-blocking).
 * The daily ops worker remains the recovery path. Concurrent drains are safe (SKIP LOCKED).
 */
/** @internal Test reset for debounce / schedule flags. */
export function resetDgEventKickStateForTests(): void {
  scheduled = false;
  lastRemoteKickAt = 0;
}

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
