import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ExtractionJob, ExtractionJobStatus } from '../domain/types';
import { getOcrRepository } from '../data/resolve-repository';
import type { OcrRepository } from '../data/ocr.repository';
import type { ListOcrCandidatesInput } from '../validation/schemas';
import { listOcrCandidatesSchema } from '../validation/schemas';

/**
 * Review surface after refresh: newest `updatedAt` first, including in-flight
 * and already-confirmed jobs so selection stays deterministic (not a random
 * leftover `needs_review` row).
 */
export const OCR_REVIEW_SURFACE_STATUSES: readonly ExtractionJobStatus[] = [
  'queued',
  'running',
  'needs_review',
  'failed',
  'rejected',
  'succeeded',
];

/**
 * List extraction jobs (typically `needs_review`) for the OCR review queue.
 * Candidates are proposals only — not ledger truth.
 */
export async function listOcrCandidates(
  context: OrgContext,
  rawInput: ListOcrCandidatesInput = {},
  repo: OcrRepository = getOcrRepository(context.db),
): Promise<ExtractionJob[]> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const input = listOcrCandidatesSchema.parse(rawInput);
  return repo.listJobsForOrg(context.organizationId, {
    status: input.status ?? 'needs_review',
  });
}
