import 'server-only';

import { randomUUID } from 'node:crypto';
import { organizationHasActiveStorage, ensureUsablePrimaryStorageConnection } from '@/modules/external-storage/server';
import { ServiceUnavailableError } from '@/shared/errors';
import type { DbExecutor } from '@/shared/db/types';
import { getAdminDb } from '@/shared/db/client';
import type { TakeoffClock, TakeoffFileStore, TakeoffIds, TakeoffWorkerClient } from './ports';
import {
  createInMemoryTakeoffFileStore,
  createOrgCloudTakeoffFileStore,
} from './application/takeoff-file-store';
import { createFakeTakeoffWorkerClient } from './application/fake-worker-client';

export const takeoffClock: TakeoffClock = { now: () => new Date() };
export const takeoffIds: TakeoffIds = { uuid: () => randomUUID() };

let fileStoreOverride: TakeoffFileStore | null = null;

export function setTakeoffFileStoreForTests(store: TakeoffFileStore): void {
  fileStoreOverride = store;
}

export function resolveTakeoffFileStore(): TakeoffFileStore {
  if (fileStoreOverride) return fileStoreOverride;
  if (process.env.TAKEOFF_FILE_STORE === 'memory') return createInMemoryTakeoffFileStore();
  return createOrgCloudTakeoffFileStore();
}

export async function assertOrgStorage(db: DbExecutor, organizationId: string): Promise<void> {
  const connection = await ensureUsablePrimaryStorageConnection(db, organizationId);
  if (!connection || !organizationHasActiveStorage(connection)) {
    throw new ServiceUnavailableError('Organization storage is not connected', 'externalStorage.errors.notConnected');
  }
}

let fakeWorkerDb: DbExecutor | null = null;

export function setFakeWorkerDbForTests(db: DbExecutor | null): void {
  fakeWorkerDb = db;
}

/** Worker result ingestion must bypass authenticated RLS (service_role in production). */
export function resolveFakeWorkerIngestDb(): DbExecutor {
  return fakeWorkerDb ?? getAdminDb();
}

export function createTakeoffWorkerClient(): TakeoffWorkerClient {
  if (process.env.TAKEOFF_USE_FAKE_WORKER === '1' && fakeWorkerDb) return createFakeTakeoffWorkerClient(fakeWorkerDb);
  return createHttpTakeoffWorkerClient();
}

export function createHttpTakeoffWorkerClient(): TakeoffWorkerClient {
  const base = process.env.TAKEOFF_WORKER_URL;
  const secret = process.env.TAKEOFF_WORKER_SECRET;
  return {
    async dispatch(request) {
      if (!base || !secret) throw new ServiceUnavailableError('worker down', 'takeoff.errors.worker_unavailable');
      const res = await fetch(`${base}/v1/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-takeoff-secret': secret },
        body: JSON.stringify(request),
      });
      if (!res.ok) throw new ServiceUnavailableError('worker dispatch failed', 'takeoff.errors.worker_unavailable');
      const data = (await res.json()) as { workerJobId?: string };
      return { accepted: true, workerJobId: data.workerJobId ?? request.jobId };
    },
    async cancel(workerJobId) {
      if (!base || !secret) return;
      await fetch(`${base}/v1/jobs/${workerJobId}`, { method: 'DELETE', headers: { 'x-takeoff-secret': secret } });
    },
    async exportAnnotatedPdf(body) {
      if (!base || !secret) throw new ServiceUnavailableError('worker down', 'takeoff.errors.worker_unavailable');
      const res = await fetch(`${base}/v1/export/annotated-pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-takeoff-secret': secret },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new ServiceUnavailableError('export failed', 'takeoff.errors.worker_unavailable');
      return new Uint8Array(await res.arrayBuffer());
    },
    async exportBoqPdf(body) {
      if (!base || !secret) throw new ServiceUnavailableError('worker down', 'takeoff.errors.worker_unavailable');
      const res = await fetch(`${base}/v1/export/boq-pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-takeoff-secret': secret },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new ServiceUnavailableError('export failed', 'takeoff.errors.worker_unavailable');
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

export const takeoffDeps = {
  get files() {
    return resolveTakeoffFileStore();
  },
  get worker() {
    return createTakeoffWorkerClient();
  },
  clock: takeoffClock,
  ids: takeoffIds,
};

export { createInMemoryTakeoffFileStore, createOrgCloudTakeoffFileStore };