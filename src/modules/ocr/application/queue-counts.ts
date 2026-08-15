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
}

export interface OcrQueueSnapshot extends OcrQueueCounts {
  readonly jobs: readonly ExtractionJob[];
}

const QUEUE_STATUSES = ['queued', 'running', 'processing', 'failed'] as const;
const QUEUE_JOB_CAP = 20;

function countJobs(jobs: readonly ExtractionJob[]): OcrQueueCounts {
  let queued = 0;
  let processing = 0;
  let failed = 0;
  for (const job of jobs) {
    if (job.status === 'queued') queued += 1;
    else if (job.status === 'running' || job.status === 'processing') processing += 1;
    else if (job.status === 'failed') failed += 1;
  }
  return { queued, processing, failed };
}

/**
 * Org-scoped OCR queue visibility for Settings. Counts only — no raw provider
 * payloads or secrets.
 */
export async function getOcrQueueSnapshot(
  context: OrgContext,
  repo: OcrRepository = getOcrRepository(context.db),
): Promise<OcrQueueSnapshot> {
  assertAnyPermission(context, [PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.DOCUMENTS_READ]);
  const jobs = await repo.listJobsForOrg(context.organizationId, {
    status: [...QUEUE_STATUSES],
  });
  return {
    ...countJobs(jobs),
    jobs: jobs.slice(0, QUEUE_JOB_CAP),
  };
}
