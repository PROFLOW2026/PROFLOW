import 'server-only';

import { after } from 'next/server';

function isTestEnv(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

export function resolveStorageProvisionWorkerTarget(): {
  readonly url: string;
  readonly secret: string;
} | null {
  const secret = process.env.OCR_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!secret || !origin) return null;
  return {
    url: `${origin.replace(/\/$/, '')}/api/internal/storage-provision-worker`,
    secret,
  };
}

async function postStorageProvisionWorker(input?: {
  readonly chain?: number;
  readonly rateLimitStreak?: number;
}): Promise<Response> {
  const target = resolveStorageProvisionWorkerTarget();
  if (!target) {
    throw new Error('Storage provision worker URL/secret not configured');
  }
  return fetch(target.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${target.secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chain: input?.chain ?? 0,
      rateLimitStreak: input?.rateLimitStreak ?? 0,
    }),
  });
}

async function runInProcessProvisionCycle(chain = 0): Promise<void> {
  const { runStorageProvisionCycle } = await import('./provision-batch');
  const result = await runStorageProvisionCycle({ chain });
  console.info('[org-storage/provision] inprocess_cycle done', {
    clientsProcessed: result.clientsProcessed,
    projectsProcessed: result.projectsProcessed,
    remaining: result.remaining,
    rateLimited: result.rateLimited,
    continued: result.continued,
  });
}

function scheduleAfter(task: () => Promise<void>): boolean {
  try {
    after(() => {
      void task().catch((error) => {
        console.error('[org-storage/provision] background task failed', {
          detail: error instanceof Error ? error.message : String(error),
        });
      });
    });
    return true;
  } catch (error) {
    console.error('[org-storage/provision] after() unavailable', {
      detail: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export type StorageProvisionKickMode =
  | 'worker_await'
  | 'inprocess_await'
  | 'worker_after'
  | 'inprocess_after'
  | 'skipped_test';

/**
 * Ensures a provision cycle actually starts.
 *
 * Prefer awaiting the internal worker HTTP call so template approval cannot
 * return success while silently swallowing an `after()`/import failure.
 */
export async function ensureStorageProvisionStarted(options?: {
  /** When true (hooks), prefer non-blocking after() if available. */
  readonly preferBackground?: boolean;
}): Promise<{
  readonly mode: StorageProvisionKickMode;
}> {
  if (isTestEnv()) return { mode: 'skipped_test' };

  const preferBackground = Boolean(options?.preferBackground);
  const target = resolveStorageProvisionWorkerTarget();

  if (preferBackground && target) {
    const scheduled = scheduleAfter(async () => {
      console.info('[org-storage/provision] kick=worker_http begin', { url: target.url });
      const response = await postStorageProvisionWorker();
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`worker HTTP ${response.status}: ${body.slice(0, 300)}`);
      }
      console.info('[org-storage/provision] kick=worker_http ok', { status: response.status });
    });
    if (scheduled) {
      console.info('[org-storage/provision] kick scheduled', { mode: 'worker_after' });
      return { mode: 'worker_after' };
    }
  }

  if (target) {
    console.info('[org-storage/provision] kick=worker_await begin', { url: target.url });
    const response = await postStorageProvisionWorker();
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`worker HTTP ${response.status}: ${body.slice(0, 300)}`);
    }
    console.info('[org-storage/provision] kick=worker_await ok', { status: response.status });
    return { mode: 'worker_await' };
  }

  console.warn(
    '[org-storage/provision] worker URL/secret missing; falling back to in-process cycle',
  );

  if (preferBackground) {
    const scheduled = scheduleAfter(async () => {
      console.info('[org-storage/provision] kick=inprocess begin');
      await runInProcessProvisionCycle(0);
    });
    if (scheduled) {
      console.info('[org-storage/provision] kick scheduled', { mode: 'inprocess_after' });
      return { mode: 'inprocess_after' };
    }
  }

  console.info('[org-storage/provision] kick=inprocess_await begin');
  await runInProcessProvisionCycle(0);
  return { mode: 'inprocess_await' };
}

/**
 * Fire-and-forget kick for hooks (project create, etc.). Prefer background;
 * failures are logged. Template approval must use ensureStorageProvisionStarted().
 */
export function kickStorageProvision(): void {
  if (isTestEnv()) return;
  void ensureStorageProvisionStarted({ preferBackground: true }).catch((error) => {
    console.error('[org-storage/provision] kick failed', {
      detail: error instanceof Error ? error.message : String(error),
    });
  });
}
