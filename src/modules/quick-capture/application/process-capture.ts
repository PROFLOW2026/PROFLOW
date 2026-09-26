import 'server-only';

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findDocumentById } from '@/modules/documents/lookups';
import { extractReceiptJob } from '@/modules/ocr/application/extract-receipt';
import { kickDurableOcrQueue } from '@/modules/ocr/application/kick-queue';
import { isOcrIngestionEnabled } from '@/modules/ocr/domain/feature-gate';
import { isOcrSupportedMime } from '@/modules/ocr/domain/cost-controls';
import { getOcrRepository } from '@/modules/ocr/data/resolve-repository';
import { listProjectsForOrg } from '@/modules/projects';
import { classifyCapture } from '../domain/classify-capture';
import type { CaptureItemRecord } from '../domain/types';
import { listCaptureDocumentsByCaptureId } from '../data/capture-documents.repository';
import { findCaptureById, updateCaptureItem } from '../data/quick-capture.repository';
import { notifyCaptureReview } from './notify-capture-review';

export async function processCapture(
  context: OrgContext,
  captureId: string,
): Promise<CaptureItemRecord> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const capture = await findCaptureById(context.db, context.organizationId, captureId);
  if (!capture) throw new NotFoundError('Quick capture');

  const junctionDocs = await listCaptureDocumentsByCaptureId(
    context.db,
    context.organizationId,
    capture.id,
  );

  const mimeTypes: string[] = [];
  for (const junction of junctionDocs) {
    const document = await findDocumentById(
      context.db,
      context.organizationId,
      junction.documentId,
    );
    if (document?.mimeType) mimeTypes.push(document.mimeType);
  }

  let primaryOcrJobId = capture.primaryOcrJobId;
  let ocrJob = primaryOcrJobId
    ? await getOcrRepository(context.db).findJob(context.organizationId, primaryOcrJobId)
    : null;

  const shouldAutoOcr =
    capture.sessionKind !== 'video' &&
    capture.documentCount === 1 &&
    junctionDocs.length === 1 &&
    isOcrIngestionEnabled();

  if (shouldAutoOcr) {
    const soleDocumentId = junctionDocs[0]!.documentId;
    const soleDocument = await findDocumentById(
      context.db,
      context.organizationId,
      soleDocumentId,
    );
    if (soleDocument && isOcrSupportedMime(soleDocument.mimeType)) {
      const job = await extractReceiptJob(context, {
        documentId: soleDocumentId,
        workflow: 'general',
        idempotencyKey: `qc:${capture.id}`,
      });
      kickDurableOcrQueue();
      primaryOcrJobId = job.id;
      ocrJob = job;
    }
  }

  const projects = await listProjectsForOrg(context, {}).catch(() => []);
  const classification = classifyCapture({
    sessionKind: capture.sessionKind,
    documentCount: capture.documentCount,
    mimeTypes,
    explicitProjectId: capture.explicitProjectId,
    ownerNote: capture.ownerNote,
    ocrJob,
    projectNames: projects.map((project) => ({ id: project.id, name: project.name })),
  });

  const ready = await updateCaptureItem(context.db, context.organizationId, capture.id, {
    status: 'ready_for_review',
    primaryOcrJobId,
    detectedType: classification.detectedType,
    detectionConfidence: classification.detectionConfidence,
    suggestedProjectId: classification.suggestedProjectId,
    suggestedVendorId: classification.suggestedVendorId,
    suggestionMetadata: classification.suggestionMetadata,
    processedAt: new Date(),
    reviewedAt: new Date(),
    processingErrorCode: null,
    processingErrorMessage: null,
  });
  if (!ready) throw new NotFoundError('Quick capture');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROCESSING_COMPLETED,
    entityType: 'quick_capture',
    entityId: capture.id,
    metadata: {
      detectedType: classification.detectedType,
      primaryOcrJobId,
    },
  });

  await notifyCaptureReview(context, ready);

  return ready;
}
