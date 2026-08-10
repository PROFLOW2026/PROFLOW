import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getOcrRepository } from '../data/resolve-repository';
import type { OcrRepository } from '../data/ocr.repository';
import type { ExtractionJob } from '../domain/types';
import type { RejectOcrCandidateInput } from '../validation/schemas';
import { rejectOcrCandidateSchema } from '../validation/schemas';

/**
 * Explicit reject — no Expense / Vendor Bill write.
 */
export async function rejectOcrCandidate(
  context: OrgContext,
  rawInput: RejectOcrCandidateInput,
  repo: OcrRepository = getOcrRepository(context.db),
): Promise<ExtractionJob> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const input = rejectOcrCandidateSchema.parse(rawInput);

  const job = await repo.findJob(context.organizationId, input.jobId);
  if (!job) throw new NotFoundError('OCR extraction job');

  if (job.confirmedExpenseId || job.confirmedVendorBillId) {
    throw new DomainRuleError(
      'Extraction was already confirmed into a draft',
      'ocr.errors.alreadyConfirmed',
    );
  }

  if (job.status !== 'needs_review' && job.status !== 'succeeded' && job.status !== 'failed') {
    throw new DomainRuleError(
      `Job status ${job.status} cannot be rejected`,
      'ocr.errors.jobNotReviewable',
    );
  }

  const updated = await repo.updateJob(context.organizationId, job.id, {
    status: 'rejected',
    reviewStatus: 'rejected',
    rejectedFields: input.rejectedFields ?? null,
    errorCode: input.reason ? 'rejected_by_reviewer' : job.errorCode,
    errorMessage: input.reason ?? job.errorMessage,
  });

  if (!updated) throw new NotFoundError('OCR extraction job');
  return updated;
}
