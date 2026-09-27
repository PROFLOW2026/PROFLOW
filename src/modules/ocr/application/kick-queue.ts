import { after } from 'next/server';

const OCR_WORKER_LIMIT = 5;

function resolveOcrWorkerUrl(): string | null {
  const base =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/api/internal/ocr-worker`;
}

function requestRemoteOcrWorkerDrain(): void {
  const secret =
    process.env.OCR_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  const url = resolveOcrWorkerUrl();
  if (!secret) {
    console.warn('[ocr-kick] skipped remote worker: missing OCR worker secret');
    return;
  }
  if (!url) {
    console.warn('[ocr-kick] skipped remote worker: could not resolve app URL');
    return;
  }

  void fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit: OCR_WORKER_LIMIT }),
  })
    .then(async (response) => {
      if (!response.ok) {
        console.warn(`[ocr-kick] remote worker HTTP ${response.status}`);
        return;
      }
      const payload = (await response.json().catch(() => null)) as
        | { claimed?: number; processed?: number }
        | null;
      if (payload && typeof payload.claimed === 'number') {
        console.info(
          `[ocr-kick] remote worker claimed=${payload.claimed} processed=${payload.processed ?? 0}`,
        );
      }
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ocr-kick] remote worker fetch failed: ${message.slice(0, 200)}`);
    });
}

function kickLocalDrain(): void {
  void import('./drain-queue')
    .then(({ drainDurableOcrQueue }) => drainDurableOcrQueue({ limit: OCR_WORKER_LIMIT }))
    .catch(() => undefined);
}

/**
 * Hobby-compatible OCR kick: start durable drain after the user-facing
 * enqueue response. Does not bypass the queue - still claims via
 * `claim_ocr_job`. Daily Vercel cron is recovery only.
 *
 * On Vercel, `after()` alone is unreliable; also POST the internal worker so
 * a separate invocation drains the queue promptly.
 */
export function kickDurableOcrQueue(): void {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return;
  }

  try {
    after(() => {
      kickLocalDrain();
    });
  } catch {
    kickLocalDrain();
  }

  if (process.env.VERCEL === '1') {
    requestRemoteOcrWorkerDrain();
  }
}
