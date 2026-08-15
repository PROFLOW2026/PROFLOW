import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getOcrRepository } from '../data/resolve-repository';
import type { OcrRepository } from '../data/ocr.repository';
import type { ExtractionJob } from '../domain/types';
import { cancelOcrJobSchema, type CancelOcrJobInput } from '../validation/schemas';
import { cancelQueuedOcrJob } from './process-job';

export async function cancelOcrJob(
  context: OrgContext,
  rawInput: CancelOcrJobInput,
  repo: OcrRepository = getOcrRepository(context.db),
): Promise<ExtractionJob> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const input = cancelOcrJobSchema.parse(rawInput);
  return cancelQueuedOcrJob(context, input.jobId, repo);
}
