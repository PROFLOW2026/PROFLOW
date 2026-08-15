import { after } from 'next/server';

/**
 * Hobby-compatible OCR kick: start durable drain after the user-facing
 * enqueue response. Does not bypass the queue — still claims via
 * `claim_ocr_job`. Daily Vercel cron is recovery only.
 */
export function kickDurableOcrQueue(): void {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return;
  }

  try {
    after(() => {
      void import('./drain-queue')
        .then(({ drainDurableOcrQueue }) => drainDurableOcrQueue())
        .catch(() => undefined);
    });
  } catch {
    // Outside a Next.js request. Daily recovery cron still drains.
  }
}
