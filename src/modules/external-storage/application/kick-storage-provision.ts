import 'server-only';

import { after } from 'next/server';
import { resolveStorageProvisionWorkerSecret } from './storage-provision-worker-auth';

function isTestEnv(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

export function resolveStorageProvisionWorkerTarget(): {
  readonly url: string;
  readonly secret: string;
} | null {
  const secret = resolveStorageProvisionWorkerSecret();
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

export async function postStorageProvisionWorker(input?: {
  readonly chain?: number;
  readonly rateLimitStreak?: number;
}): Promise<Response> {
  const target = resolveStorageProvisionWorkerTarget();
  if (!target) {
    throw new Error('STORAGE_PROVISION_WORKER_SECRET or app URL not configured');
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

export type StorageProvisionKickMode = 'worker_await' | 'worker_after' | 'skipped_test';

/**
 * Ensures provisioning starts via the durable HTTP worker.
 * Does not use recursive in-process after() for work — only to fire the first HTTP kick.
 */
export async function ensureStorageProvisionStarted(options?: {
  readonly preferBackground?: boolean;
}): Promise<{
  readonly mode: StorageProvisionKickMode;
}> {
  if (isTestEnv()) return { mode: 'skipped_test' };

  const preferBackground = Boolean(options?.preferBackground);
  const target = resolveStorageProvisionWorkerTarget();
  if (!target) {
    throw new Error(
      'STORAGE_PROVISION_WORKER_SECRET (and APP_URL / NEXT_PUBLIC_APP_URL) required to start provisioning',
    );
  }

  if (preferBackground) {
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

  console.info('[org-storage/provision] kick=worker_await begin', { url: target.url });
  const response = await postStorageProvisionWorker();
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`worker HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  console.info('[org-storage/provision] kick=worker_await ok', { status: response.status });
  return { mode: 'worker_await' };
}

/** Fire-and-forget kick for hooks. Prefer background HTTP kick. */
export function kickStorageProvision(): void {
  if (isTestEnv()) return;
  void ensureStorageProvisionStarted({ preferBackground: true }).catch((error) => {
    console.error('[org-storage/provision] kick failed', {
      detail: error instanceof Error ? error.message : String(error),
    });
  });
}

const PREPARING_KICK_THROTTLE_MS = 60_000;
let lastPreparingKickAt = 0;

/**
 * Recovery path when UI/ops observes preparing work with remaining folders.
 * Throttled so page refreshes do not stampede the worker.
 */
export function kickStorageProvisionIfPreparing(input: {
  readonly state: 'ready' | 'preparing';
  readonly clientsTotal: number;
  readonly clientsProvisioned: number;
  readonly projectsTotal: number;
  readonly projectsProvisioned: number;
}): void {
  if (isTestEnv()) return;
  if (input.state !== 'preparing') return;
  const remaining =
    Math.max(0, input.clientsTotal - input.clientsProvisioned) +
    Math.max(0, input.projectsTotal - input.projectsProvisioned);
  if (remaining <= 0) return;
  const now = Date.now();
  if (now - lastPreparingKickAt < PREPARING_KICK_THROTTLE_MS) return;
  lastPreparingKickAt = now;
  console.info('[org-storage/provision] preparing self-heal kick', { remaining });
  kickStorageProvision();
}

/**
 * Ops/cron recovery: start (or restart) the durable HTTP provision chain.
 * Uses STORAGE_PROVISION_WORKER_SECRET — does not require nesting work in the ops request.
 */
export async function recoverStorageProvisionViaWorker(): Promise<{
  readonly kicked: boolean;
  readonly status?: number;
  readonly detail?: string;
}> {
  if (isTestEnv()) return { kicked: false, detail: 'test' };
  const target = resolveStorageProvisionWorkerTarget();
  if (!target) {
    return { kicked: false, detail: 'STORAGE_PROVISION_WORKER_SECRET or app URL missing' };
  }
  try {
    const response = await postStorageProvisionWorker({ chain: 0, rateLimitStreak: 0 });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { kicked: false, status: response.status, detail: body.slice(0, 300) };
    }
    return { kicked: true, status: response.status };
  } catch (error) {
    return {
      kicked: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
