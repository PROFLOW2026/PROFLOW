import type { OrgContext } from '@/shared/auth/context';
import { assertAnyPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getOcrRepository } from '../data/resolve-repository';
import type { OcrRepository } from '../data/ocr.repository';
import type { ExtractionJob } from '../domain/types';

export interface OcrQueueCounts {
  readonly queued: number;
  readonly processing: number;
  readonly failed: number;
  readonly needsReview: number;
}

export interface OcrQueueSnapshot extends OcrQueueCounts {
  readonly jobs: readonly ExtractionJob[];
}

const SNAPSHOT_STATUSES = [
  'queued',
  'running',
  'processing',
  'failed',
  'needs_review',
] as const;
const ACTIONABLE_STATUSES = new Set(['queued', 'running', 'processing', 'failed']);
const QUEUE_JOB_CAP = 20;

function countJobs(jobs: readonly ExtractionJob[]): OcrQueueCounts {
  let queued = 0;
  let processing = 0;
  let failed = 0;
  let needsReview = 0;
  for (const job of jobs) {
    if (job.status === 'queued') queued += 1;
    else if (job.status === 'running' || job.status === 'processing') processing += 1;
    else if (job.status === 'failed') failed += 1;
    else if (job.status === 'needs_review') needsReview += 1;
  }
  return { queued, processing, failed, needsReview };
}

/**
 * Org-scoped OCR queue visibility for Settings. Counts only - no raw provider
 * payloads or secrets.
 */
export async function getOcrQueueSnapshot(
  context: OrgContext,
  repo: OcrRepository = getOcrRepository(context.db),
): Promise<OcrQueueSnapshot> {
  assertAnyPermission(context, [PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DOCUMENTS_READ]);
  const jobs = await repo.listJobsForOrg(context.organizationId, {
    status: [...SNAPSHOT_STATUSES],
  });
  return {
    ...countJobs(jobs),
    jobs: jobs.filter((job) => ACTIONABLE_STATUSES.has(job.status)).slice(0, QUEUE_JOB_CAP),
  };
}
