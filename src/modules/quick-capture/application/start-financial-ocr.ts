import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { extractReceiptJob } from '@/modules/ocr/application/extract-receipt';
import { kickDurableOcrQueue } from '@/modules/ocr/application/kick-queue';
import { isOcrIngestionEnabled } from '@/modules/ocr/domain/feature-gate';
import type { ExtractionJob } from '@/modules/ocr';
import { assertCaptureSessionDocument } from './assert-capture-session-document';
import { findCaptureById, updateCaptureItem } from '../data/quick-capture.repository';

export type StartFinancialOcrInput = {
  readonly captureId: string;
  readonly documentId: string;
  readonly forceRetry?: boolean;
};

export async function startFinancialOcr(
  context: OrgContext,
  input: StartFinancialOcrInput,
): Promise<ExtractionJob> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  if (!isOcrIngestionEnabled()) {
    throw new DomainRuleError('OCR reader unavailable', 'ocr.errors.featureDisabled');
  }

  const capture = await findCaptureById(context.db, context.organizationId, input.captureId);
  if (!capture) throw new NotFoundError('Quick capture');
  if (capture.sessionKind === 'video') {
    throw new DomainRuleError('Video never uses OCR', 'quickCapture.errors.videoNoOcr');
  }

  await assertCaptureSessionDocument(context, input.captureId, input.documentId);

  const job = await extractReceiptJob(context, {
    documentId: input.documentId,
    workflow: 'general',
    idempotencyKey: `qc:${input.captureId}:${input.documentId}`,
    forceRetry: input.forceRetry,
  });
  kickDurableOcrQueue();

  await updateCaptureItem(context.db, context.organizationId, input.captureId, {
    selectedFinancialDocumentId: input.documentId,
    primaryOcrJobId: job.id,
  });

  return job;
}
