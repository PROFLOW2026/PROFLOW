import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ExtractionJob } from '../domain/types';
import {
  OCR_REVIEW_SURFACE_STATUSES,
} from '../domain/review-queue';
import { getOcrRepository } from '../data/resolve-repository';
import type { OcrRepository } from '../data/ocr.repository';
import type { ListOcrCandidatesInput } from '../validation/schemas';
import { listOcrCandidatesSchema } from '../validation/schemas';

export {
  OCR_REVIEW_SURFACE_STATUSES,
  OCR_REVIEW_HISTORY_STATUSES,
  isOcrActiveQueueStatus,
  isOcrHistoryStatus,
} from '../domain/review-queue';

/**
 * List extraction jobs for the OCR review queue or history.
 * Candidates are proposals only - not ledger truth.
 */
export async function listOcrCandidates(
  context: OrgContext,
  rawInput: ListOcrCandidatesInput = {},
  repo: OcrRepository = getOcrRepository(context.db),
): Promise<ExtractionJob[]> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const input = listOcrCandidatesSchema.parse(rawInput);
  return repo.listJobsForOrg(context.organizationId, {
    status: input.status ?? [...OCR_REVIEW_SURFACE_STATUSES],
  });
}
