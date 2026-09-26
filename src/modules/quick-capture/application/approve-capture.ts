import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { linkDocumentToEntity } from '@/modules/documents';
import { relocateDocumentToSemanticFolder } from '@/modules/external-storage/application/relocate-document-file';
import { confirmOcrCandidate } from '@/modules/ocr/application/confirm-candidate';
import { getOcrRepository } from '@/modules/ocr';
import type { SemanticFolderType } from '@drizzle/schema/external-storage';
import { assertFieldMediaCategory, type FieldMediaCategory } from '../domain/field-media-categories';
import type { CaptureItemRecord, DetectedType } from '../domain/types';
import { listCaptureDocumentsByCaptureId } from '../data/capture-documents.repository';
import { findCaptureById, updateCaptureItem } from '../data/quick-capture.repository';
import type { ConfirmOcrCandidateInput } from '@/modules/ocr/validation/schemas';
import { assertCaptureSessionDocument } from './assert-capture-session-document';

export type ApproveFieldMediaInput = {
  readonly captureId: string;
  readonly projectId: string;
  readonly category: FieldMediaCategory;
  readonly taskId?: string | null;
  readonly workOrderId?: string | null;
};

export type ApproveFinancialInput = {
  readonly captureId: string;
  readonly confirmInput: ConfirmOcrCandidateInput;
};

export type ApproveOtherDocumentInput = {
  readonly captureId: string;
  readonly ownerType: 'project' | 'client' | 'vendor' | 'organization';
  readonly ownerId: string;
  readonly label?: string | null;
  readonly semanticFolderType?: SemanticFolderType;
};

export async function approveFieldMediaCapture(
  context: OrgContext,
  input: ApproveFieldMediaInput,
): Promise<CaptureItemRecord> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  const category = assertFieldMediaCategory(input.category);

  const capture = await findCaptureById(context.db, context.organizationId, input.captureId);
  if (!capture) throw new NotFoundError('Quick capture');
  if (capture.status !== 'ready_for_review') {
    throw new DomainRuleError('Capture is not ready for review', 'quickCapture.errors.notReady');
  }

  const junctionDocs = await listCaptureDocumentsByCaptureId(
    context.db,
    context.organizationId,
    capture.id,
  );

  for (const junction of junctionDocs) {
    await linkDocumentToEntity(context, {
      documentId: junction.documentId,
      ownerType: 'project',
      ownerId: input.projectId,
      label: category,
    });
    if (input.taskId) {
      await linkDocumentToEntity(context, {
        documentId: junction.documentId,
        ownerType: 'task',
        ownerId: input.taskId,
        label: category,
      });
    }
    if (input.workOrderId) {
      await linkDocumentToEntity(context, {
        documentId: junction.documentId,
        ownerType: 'work_order',
        ownerId: input.workOrderId,
        label: category,
      });
    }
    await relocateDocumentToSemanticFolder(context, {
      documentId: junction.documentId,
      projectId: input.projectId,
      semanticFolderType: 'photos',
    });
  }

  const approved = await updateCaptureItem(context.db, context.organizationId, capture.id, {
    status: 'approved',
    ownerSelectedType: 'field_media',
    routedEntityType: 'document_link_batch',
    routedEntityId: null,
    approvedAt: new Date(),
  });
  if (!approved) throw new NotFoundError('Quick capture');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.APPROVED,
    entityType: 'quick_capture',
    entityId: capture.id,
    metadata: { route: 'field_media', projectId: input.projectId, documentCount: junctionDocs.length },
  });

  return approved;
}

export async function approveFinancialCapture(
  context: OrgContext,
  input: ApproveFinancialInput,
): Promise<CaptureItemRecord> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  assertPermission(context, PERMISSIONS.EXPENSES_CREATE);

  const capture = await findCaptureById(context.db, context.organizationId, input.captureId);
  if (!capture) throw new NotFoundError('Quick capture');
  if (capture.status !== 'ready_for_review') {
    throw new DomainRuleError('Capture is not ready for review', 'quickCapture.errors.notReady');
  }
  if (capture.sessionKind === 'video') {
    throw new DomainRuleError('Video cannot be financial', 'quickCapture.errors.videoNoFinancial');
  }

  const financialDocumentId =
    capture.selectedFinancialDocumentId ??
    (capture.documentCount === 1
      ? (await listCaptureDocumentsByCaptureId(context.db, context.organizationId, capture.id))[0]
          ?.documentId
      : null);
  if (!financialDocumentId) {
    throw new DomainRuleError('Financial document not selected', 'quickCapture.errors.noFinancialDocument');
  }

  await assertCaptureSessionDocument(context, capture.id, financialDocumentId);

  const jobId = input.confirmInput.jobId ?? capture.primaryOcrJobId;
  if (!jobId) {
    throw new DomainRuleError('OCR job missing', 'quickCapture.errors.ocrRequired');
  }

  const job = await getOcrRepository(context.db).findJob(context.organizationId, jobId);
  if (!job || job.status !== 'needs_review') {
    throw new DomainRuleError('OCR not ready for confirm', 'quickCapture.errors.ocrNotReady');
  }

  await confirmOcrCandidate(context, {
    ...input.confirmInput,
    jobId,
    confirm: true,
  });

  const approved = await updateCaptureItem(context.db, context.organizationId, capture.id, {
    status: 'approved',
    ownerSelectedType: 'financial_document',
    selectedFinancialDocumentId: financialDocumentId,
    primaryOcrJobId: jobId,
    routedEntityType: 'ocr_confirmed_draft',
    routedEntityId: jobId,
    approvedAt: new Date(),
  });
  if (!approved) throw new NotFoundError('Quick capture');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.APPROVED,
    entityType: 'quick_capture',
    entityId: capture.id,
    metadata: { route: 'financial_document', jobId },
  });

  return approved;
}

export async function approveOtherDocumentCapture(
  context: OrgContext,
  input: ApproveOtherDocumentInput,
): Promise<CaptureItemRecord> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const capture = await findCaptureById(context.db, context.organizationId, input.captureId);
  if (!capture) throw new NotFoundError('Quick capture');
  if (capture.status !== 'ready_for_review') {
    throw new DomainRuleError('Capture is not ready for review', 'quickCapture.errors.notReady');
  }

  const semanticFolderType = input.semanticFolderType ?? 'documents';
  const junctionDocs = await listCaptureDocumentsByCaptureId(
    context.db,
    context.organizationId,
    capture.id,
  );

  for (const junction of junctionDocs) {
    await linkDocumentToEntity(context, {
      documentId: junction.documentId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      label: input.label ?? 'other',
    });
    if (input.ownerType === 'project') {
      await relocateDocumentToSemanticFolder(context, {
        documentId: junction.documentId,
        projectId: input.ownerId,
        semanticFolderType,
      });
    }
  }

  const approved = await updateCaptureItem(context.db, context.organizationId, capture.id, {
    status: 'approved',
    ownerSelectedType: 'other_document',
    routedEntityType: input.ownerType,
    routedEntityId: input.ownerId,
    approvedAt: new Date(),
  });
  if (!approved) throw new NotFoundError('Quick capture');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.ROUTED,
    entityType: 'quick_capture',
    entityId: capture.id,
    metadata: { route: 'other_document', ownerType: input.ownerType, ownerId: input.ownerId },
  });

  return approved;
}

export async function approveCapture(
  context: OrgContext,
  input: {
    readonly captureId: string;
    readonly ownerSelectedType: DetectedType;
  } & Partial<ApproveFieldMediaInput & ApproveFinancialInput & ApproveOtherDocumentInput>,
): Promise<CaptureItemRecord> {
  switch (input.ownerSelectedType) {
    case 'field_media':
      if (!input.projectId || !input.category) {
        throw new DomainRuleError('Project and category required', 'quickCapture.errors.fieldMediaRequired');
      }
      return approveFieldMediaCapture(context, {
        captureId: input.captureId,
        projectId: input.projectId,
        category: input.category,
        taskId: input.taskId ?? null,
        workOrderId: input.workOrderId ?? null,
      });
    case 'financial_document':
      if (!input.confirmInput) {
        throw new DomainRuleError('OCR confirm required', 'quickCapture.errors.ocrConfirmRequired');
      }
      return approveFinancialCapture(context, {
        captureId: input.captureId,
        confirmInput: input.confirmInput,
      });
    case 'other_document':
      if (!input.ownerType || !input.ownerId) {
        throw new DomainRuleError('Destination required', 'quickCapture.errors.destinationRequired');
      }
      return approveOtherDocumentCapture(context, {
        captureId: input.captureId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        label: input.label ?? null,
        semanticFolderType: input.semanticFolderType,
      });
    default:
      throw new DomainRuleError('Unsupported approval type', 'quickCapture.errors.unsupportedApprovalType');
  }
}
