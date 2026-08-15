import type { OrgContext } from '@/shared/auth/context';
import { ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
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

  if (job.confirmedExpenseId || job.confirmedVendorBillId || job.confirmedVendorCreditId) {
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

  const updated = await repo.claimJob(
    context.organizationId,
    job.id,
    ['needs_review', 'succeeded', 'failed'],
    {
      status: 'rejected',
      reviewStatus: 'rejected',
      rejectedFields: input.rejectedFields ?? null,
      errorCode: input.reason ? 'rejected_by_reviewer' : job.errorCode,
      errorMessage: input.reason ?? job.errorMessage,
    },
  );
  if (!updated) {
    const latest = await repo.findJob(context.organizationId, job.id);
    if (
      latest?.confirmedExpenseId ||
      latest?.confirmedVendorBillId ||
      latest?.confirmedVendorCreditId
    ) {
      throw new DomainRuleError(
        'Extraction was already confirmed into a draft',
        'ocr.errors.alreadyConfirmed',
      );
    }
    throw new ConflictError('OCR job was updated concurrently');
  }
  return updated;
}
