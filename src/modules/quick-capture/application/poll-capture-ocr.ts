import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { kickDurableOcrQueue } from '@/modules/ocr/application/kick-queue';
import type { ExtractionJob } from '@/modules/ocr';
import { getOcrRepository } from '@/modules/ocr';
import { findCaptureById } from '../data/quick-capture.repository';

export type CaptureOcrPollResult = {
  readonly captureId: string;
  readonly job: ExtractionJob | null;
};

const QUEUED_STALE_MS = 15_000;

export async function pollCaptureOcr(
  context: OrgContext,
  captureId: string,
): Promise<CaptureOcrPollResult> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const capture = await findCaptureById(context.db, context.organizationId, captureId);
  if (!capture) throw new NotFoundError('Quick capture');
  if (!capture.primaryOcrJobId) {
    return { captureId, job: null };
  }

  const repo = getOcrRepository(context.db);
  const job = await repo.findJob(context.organizationId, capture.primaryOcrJobId);

  if (job?.status === 'queued') {
    const queuedAt = job.queuedAt ? new Date(job.queuedAt).getTime() : 0;
    if (queuedAt > 0 && Date.now() - queuedAt >= QUEUED_STALE_MS) {
      kickDurableOcrQueue();
    }
  }

  return { captureId, job };
}
