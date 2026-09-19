import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { isOcrIngestionEnabled } from '@/modules/ocr/domain/feature-gate';
import { extractReceiptJob } from '@/modules/ocr/application/extract-receipt';
import { kickDurableOcrQueue } from '@/modules/ocr/application/kick-queue';
import { getOcrRepository } from '@/modules/ocr';
import { sha256Hex } from '@/modules/ocr/application/load-document-bytes';
import { DomainRuleError } from '@/shared/errors';
import type { ExternalExpenseImport } from '../domain/types';
import { sumitOcrIdempotencyKey } from '../domain/types';
import { updateImport } from '../data/imports.repository';
import { resolveSumitHttpClientForOrg } from './resolve-sumit-client';

const TERMINAL_IMPORT_STATUSES = new Set(['linked', 'ignored']);

/**
 * Fetch SUMIT PDF and queue existing ProjectFlow OCR (contentBase64 path).
 * Idempotent via sumit:DocumentID key on the OCR job.
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

  let pdfBytes: Uint8Array;
  try {
    const pdf = await client.getDocumentPdf(imp.externalDocumentId, true);
    pdfBytes = pdf.bytes;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF fetch failed';
    const failed = await updateImport(context.db, context.organizationId, imp.id, {
      status: 'failed',
      errorCode: 'pdf_fetch',
      errorMessage: message.slice(0, 500),
      lastCheckedAt: new Date(),
    });
    return failed ?? imp;
  }

  const checksum = sha256Hex(pdfBytes);
  const contentBase64 = Buffer.from(pdfBytes).toString('base64');
  const filename = `sumit-expense-${imp.externalDocumentId}.pdf`;

  const job = await extractReceiptJob(context, {
    contentBase64,
    mimeType: 'application/pdf',
    filename,
    workflow: 'vendor_bill',
    idempotencyKey,
  });

  await ocrRepo.updateJob(context.organizationId, job.id, {
    rawMetadata: {
      ...(job.rawMetadata ?? { providerId: job.providerId }),
      checksumSha256: checksum,
      workflow: 'vendor_bill',
      importSource: 'sumit',
      externalDocumentId: imp.externalDocumentId,
      externalExpenseImportId: imp.id,
    },
  });

  const queued = await updateImport(context.db, context.organizationId, imp.id, {
    status: 'ocr_queued',
    ocrJobId: job.id,
    pdfChecksumSha256: checksum,
    lastCheckedAt: new Date(),
    errorCode: null,
    errorMessage: null,
  });

  kickDurableOcrQueue();
  return queued ?? imp;
}
