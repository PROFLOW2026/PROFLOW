import type { OrgContext } from '@/shared/auth/context';
import { findDocumentById } from '@/modules/documents/lookups';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { recountOcrBatchFromJobs } from '../domain/job-lifecycle';
import type { OcrProvider } from '../domain/provider';
import { getOcrProvider } from '../domain/provider-registry';
import type { ExtractionJob, OcrBatch } from '../domain/types';
import { getOcrRepository } from '../data/resolve-repository';
import type { OcrRepository } from '../data/ocr.repository';
import type { CreateOcrBatchAppInput, ExtractReceiptAppInput } from '../validation/schemas';
import { createOcrBatchSchema } from '../validation/schemas';
import { extractReceiptJob } from './extract-receipt';
import { refreshBatchProgress } from './process-job';

export async function createOcrBatch(
  context: OrgContext,
  rawInput: CreateOcrBatchAppInput = {},
  provider: OcrProvider = getOcrProvider(),
  repo: OcrRepository = getOcrRepository(context.db),
): Promise<{ batch: OcrBatch; jobs: ExtractionJob[] }> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const input = createOcrBatchSchema.parse(rawInput);

  const documentIds = input.documentIds ?? [];
  for (const documentId of documentIds) {
    const document = await findDocumentById(context.db, context.organizationId, documentId);
    if (!document || document.deletedAt || document.status === 'deleted') {
      throw new NotFoundError('Document');
    }
  }

  const totalCount = input.totalCount ?? documentIds.length;
  const batch = await repo.createBatch({
    organizationId: context.organizationId,
    createdByUserId: context.userId,
    totalCount,
  });

  const jobs: ExtractionJob[] = [];
  const extractInput = input.extract;
  for (const documentId of documentIds) {
    const job = await extractReceiptJob(
      context,
      {
        documentId,
        filename: extractInput?.filename,
        mimeType: extractInput?.mimeType,
        workflow: extractInput?.workflow,
        batchId: batch.id,
      },
      provider,
      repo,
    );
    if (!job.batchId) {
      await repo.updateJob(context.organizationId, job.id, { batchId: batch.id });
    }
    jobs.push(job);
  }

  await refreshBatchProgress(context.organizationId, batch.id, repo);
  const latest = (await repo.findBatch(context.organizationId, batch.id)) ?? batch;
  return { batch: latest, jobs };
}

export async function listOcrBatches(
  context: OrgContext,
  repo: OcrRepository = getOcrRepository(context.db),
): Promise<OcrBatch[]> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  return repo.listBatchesForOrg(context.organizationId);
}

export async function getOcrBatchProgress(
  context: OrgContext,
  batchId: string,
  repo: OcrRepository = getOcrRepository(context.db),
): Promise<{ batch: OcrBatch; jobs: ExtractionJob[] } | null> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const batch = await repo.findBatch(context.organizationId, batchId);
  if (!batch) return null;
  const jobs = await repo.listJobsForOrg(context.organizationId, { batchId });
  const counts = recountOcrBatchFromJobs(jobs, batch.totalCount);
  return { batch: { ...batch, ...counts }, jobs };
}
