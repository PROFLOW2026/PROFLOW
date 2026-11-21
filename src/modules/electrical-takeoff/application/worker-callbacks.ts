import 'server-only';

import { randomUUID } from 'node:crypto';
import {
  findArtifactByJobAndName,
  findJob,
  ingestWorkerResult,
  insertArtifact,
  markJobIngestFailed,
  updateJobProgress,
} from '../data/takeoff.repository';
import { parseWorkerProgressPayload, parseWorkerResultPayload } from '../domain/worker-json';
import { formatWorkerIngestError, WorkerIngestError } from '../domain/worker-ingest-error';
import { verifyJobBearer, verifyStoredTokenHash } from './worker-token';
import type { DbExecutor } from '@/shared/db/types';

export type WorkerCallbackDenyReason = 'bad_token' | 'job_mismatch' | 'job_missing' | 'cancelled';

export async function inspectWorkerCallbackAuth(
  db: DbExecutor,
  jobId: string,
  bearer: string,
  secret: string,
  nowMs = Date.now(),
) {
  const verified = verifyJobBearer(bearer, secret, nowMs);
  if (!verified) return { job: null, reason: 'bad_token' as const satisfies WorkerCallbackDenyReason };
  if (verified.jobId !== jobId) return { job: null, reason: 'job_mismatch' as const satisfies WorkerCallbackDenyReason };
  const job = await findJob(db, '', jobId);
  if (!job) return { job: null, reason: 'job_missing' as const satisfies WorkerCallbackDenyReason };
  if (job.status === 'cancelled') return { job: null, reason: 'cancelled' as const satisfies WorkerCallbackDenyReason };
  // Job callback token (stored hash) or a freshly re-sealed bearer (e.g. export download URL).
  if (job.tokenHash && verifyStoredTokenHash(bearer, secret, job.tokenHash)) return { job, reason: null };
  return { job, reason: null };
}

export async function authorizeWorkerJob(db: DbExecutor, jobId: string, bearer: string, secret: string) {
  const { job } = await inspectWorkerCallbackAuth(db, jobId, bearer, secret);
  return job;
}

export async function applyWorkerProgress(db: DbExecutor, jobId: string, body: unknown) {
  const progress = parseWorkerProgressPayload(body);
  const job = await findJob(db, '', jobId);
  if (!job) return;
  const status = progress.percent >= 100 ? 'running' : 'running';
  await updateJobProgress(db, job.organizationId, jobId, {
    stage: progress.stage,
    percent: progress.percent,
    message: progress.message ?? null,
    status,
  });
}

export { coerceWorkerWireJson, parseWorkerResultPayload } from '../domain/worker-json';

export async function applyWorkerResult(db: DbExecutor, jobId: string, body: unknown) {
  const job = await findJob(db, '', jobId);
  if (!job) return { alreadyIngested: true };
  let result;
  try {
    result = parseWorkerResultPayload(body);
  } catch (err) {
    const message = formatWorkerIngestError(err);
    await markJobIngestFailed(db, job.organizationId, jobId, message);
    throw new WorkerIngestError(message, err);
  }
  try {
    return await ingestWorkerResult(db, job.organizationId, job.projectId, job.analysisId, jobId, result);
  } catch (err) {
    const message = formatWorkerIngestError(err);
    await markJobIngestFailed(db, job.organizationId, jobId, message);
    throw new WorkerIngestError(message, err);
  }
}

export async function applyWorkerArtifact(
  db: DbExecutor,
  jobId: string,
  name: string,
  bytes: Uint8Array,
  mimeType: string,
) {
  const job = await findJob(db, '', jobId);
  if (!job) throw new Error('job missing');
  const existing = await findArtifactByJobAndName(db, job.organizationId, jobId, name);
  if (existing) return existing.id;
  const { putTakeoffArtifactBytes } = await import('./takeoff-artifact-store');
  await putTakeoffArtifactBytes({
    organizationId: job.organizationId,
    jobId,
    name,
    mimeType,
    bytes,
  });
  const row = await insertArtifact(db, {
    id: randomUUID(),
    organizationId: job.organizationId,
    projectId: job.projectId,
    jobId,
    analysisId: job.analysisId,
    name,
    kind: mimeType.startsWith('image/') ? 'preview' : 'export',
    mimeType,
    sizeBytes: bytes.length,
    evidenceId: null,
  });
  return row.id;
}