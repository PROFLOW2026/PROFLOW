import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { isOcrIngestionEnabled } from '@/modules/ocr/domain/feature-gate';
import { extractReceiptJob } from '@/modules/ocr/application/extract-receipt';
import { kickDurableOcrQueue } from '@/modules/ocr/application/kick-queue';
import { getOcrRepository } from '@/modules/ocr';
import { DomainRuleError } from '@/shared/errors';
import type { ExternalExpenseImport } from '../domain/types';
import { sumitOcrIdempotencyKey } from '../domain/types';
import { updateImport } from '../data/imports.repository';
import { resolveSumitHttpClientForOrg } from './resolve-sumit-client';

const TERMINAL_IMPORT_STATUSES = new Set(['linked', 'ignored']);

/**
 * Queue existing ProjectFlow OCR for a SUMIT expense document.
 * PDF bytes are not kept in process memory. The worker re-fetches by SUMIT document id
 * stored on the job (`externalDocumentId` and idempotency key `sumit:{id}`).
 */
export async function queueSumitImportOcr(
  context: OrgContext,
  imp: ExternalExpenseImport,
): Promise<ExternalExpenseImport> {
  if (TERMINAL_IMPORT_STATUSES.has(imp.status)) return imp;
  if (!isOcrIngestionEnabled()) {
    throw new DomainRuleError(
      'OCR ingestion is disabled',
      'ocr.errors.featureDisabled',
    );
  }

  const idempotencyKey = sumitOcrIdempotencyKey(imp.externalDocumentId);
  const ocrRepo = getOcrRepository(context.db);
  const existingJob = await ocrRepo.findJobByIdempotencyKey(
    context.organizationId,
    idempotencyKey,
  );
  if (existingJob) {
    const synced = await updateImport(context.db, context.organizationId, imp.id, {
      status:
        existingJob.status === 'needs_review' || existingJob.status === 'succeeded'
          ? 'needs_review'
          : existingJob.status === 'failed'
            ? 'failed'
            : 'ocr_queued',
      ocrJobId: existingJob.id,
      pdfChecksumSha256: existingJob.rawMetadata?.checksumSha256 ?? imp.pdfChecksumSha256,
      lastCheckedAt: new Date(),
      errorCode: existingJob.errorCode,
      errorMessage: existingJob.errorMessage,
    });
    return synced ?? imp;
  }

  const client = await resolveSumitHttpClientForOrg(context);
  if (!client) {
    const failed = await updateImport(context.db, context.organizationId, imp.id, {
      status: 'failed',
      errorCode: 'sumit_not_connected',
      errorMessage: 'SUMIT is not connected',
      lastCheckedAt: new Date(),
    });
    return failed ?? imp;
  }

  const filename = `sumit-expense-${imp.externalDocumentId}.pdf`;

  const job = await extractReceiptJob(context, {
    mimeType: 'application/pdf',
    filename,
    workflow: 'vendor_bill',
    idempotencyKey,
    sumitDocumentId: imp.externalDocumentId,
    externalExpenseImportId: imp.id,
  });

  const queued = await updateImport(context.db, context.organizationId, imp.id, {
    status: 'ocr_queued',
    ocrJobId: job.id,
    pdfChecksumSha256: job.rawMetadata?.checksumSha256 ?? imp.pdfChecksumSha256,
    lastCheckedAt: new Date(),
    errorCode: null,
    errorMessage: null,
  });

  kickDurableOcrQueue();
  return queued ?? imp;
}
