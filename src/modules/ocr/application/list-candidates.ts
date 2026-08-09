import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ExtractionJob } from '../domain/types';
import { listJobsForOrg } from '../data/in-memory-ocr.store';
import type { ListOcrCandidatesInput } from '../validation/schemas';
import { listOcrCandidatesSchema } from '../validation/schemas';

/**
 * List extraction jobs (typically `needs_review`) for the OCR review queue.
 * Candidates are proposals only — not ledger truth.
 */
export function listOcrCandidates(
  context: OrgContext,
  rawInput: ListOcrCandidatesInput = {},
): ExtractionJob[] {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const input = listOcrCandidatesSchema.parse(rawInput);
  return listJobsForOrg(context.organizationId, {
    status: input.status ?? 'needs_review',
  });
}
