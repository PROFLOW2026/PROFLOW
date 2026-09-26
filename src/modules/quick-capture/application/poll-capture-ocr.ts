import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ExtractionJob } from '@/modules/ocr';
import { getOcrRepository } from '@/modules/ocr';
import { findCaptureById } from '../data/quick-capture.repository';

export type CaptureOcrPollResult = {
  readonly captureId: string;
  readonly job: ExtractionJob | null;
};

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

  const job = await getOcrRepository(context.db).findJob(
    context.organizationId,
    capture.primaryOcrJobId,
  );
  return { captureId, job };
}
