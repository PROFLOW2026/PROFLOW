import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { prepareDocumentUpload } from '@/modules/documents';
import { validateSessionFiles } from '../domain/capture-session-limits';
import type {
  CaptureSource,
  PreparedCaptureDocument,
  SessionFileInput,
  SubmitCaptureResult,
} from '../domain/types';
import { insertCaptureDocument } from '../data/capture-documents.repository';
import {
  findCaptureByIdempotencyKey,
  insertCaptureItem,
} from '../data/quick-capture.repository';

export type SubmitCaptureInput = {
  readonly files: readonly SessionFileInput[];
  readonly ownerNote?: string | null;
  readonly explicitProjectId?: string | null;
  readonly source?: CaptureSource;
  readonly idempotencyKey?: string | null;
};

export async function submitCapture(
  context: OrgContext,
  input: SubmitCaptureInput,
): Promise<SubmitCaptureResult> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const validation = validateSessionFiles(input.files);
  if (!validation.ok) {
    throw new DomainRuleError(validation.code, validation.messageKey);
  }

  if (input.idempotencyKey) {
    const existing = await findCaptureByIdempotencyKey(
      context.db,
      context.organizationId,
      input.idempotencyKey,
    );
    if (existing) {
      throw new DomainRuleError('Duplicate capture session', 'quickCapture.errors.duplicateSession');
    }
  }

  const capture = await insertCaptureItem(context.db, {
    organizationId: context.organizationId,
    createdByUserId: context.userId,
    status: 'captured',
    source: input.source ?? 'quick_capture',
    sessionKind: validation.sessionKind,
    documentCount: input.files.length,
    ownerNote: input.ownerNote ?? null,
    explicitProjectId: input.explicitProjectId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  });

  const preparedDocuments: PreparedCaptureDocument[] = [];

  for (let position = 0; position < input.files.length; position += 1) {
    const file = input.files[position]!;
    const prepared = await prepareDocumentUpload(context, {
      ownerType: 'organization',
      ownerId: context.organizationId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      label: 'inbox_capture',
    });

    await insertCaptureDocument(context.db, {
      quickCaptureItemId: capture.id,
      documentId: prepared.document.id,
      organizationId: context.organizationId,
      position,
    });

    preparedDocuments.push({
      documentId: prepared.document.id,
      position,
      uploadUrl: prepared.uploadUrl,
      expiresAt: prepared.uploadExpiresAt.toISOString(),
      uploadMode: prepared.uploadMode,
      uploadToken: prepared.uploadToken,
      uploadPath: prepared.uploadPath,
      uploadBucket: prepared.uploadBucket,
    });
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.QUICK_CAPTURE_CREATED,
    entityType: 'quick_capture',
    entityId: capture.id,
    metadata: {
      sessionKind: capture.sessionKind,
      documentCount: capture.documentCount,
    },
  });

  return { capture, documents: preparedDocuments };
}

export async function markCaptureUploadFailed(
  context: OrgContext,
  captureId: string,
  input: { errorCode?: string | null; errorMessage?: string | null },
): Promise<void> {
  const { updateCaptureItem } = await import('../data/quick-capture.repository');
  const updated = await updateCaptureItem(context.db, context.organizationId, captureId, {
    status: 'failed',
    processingErrorCode: input.errorCode ?? 'upload_failed',
    processingErrorMessage: input.errorMessage ?? null,
  });
  if (!updated) throw new NotFoundError('Quick capture');
}

export async function assertCaptureAwaitingUpload(
  context: OrgContext,
  captureId: string,
): Promise<void> {
  const { findCaptureById } = await import('../data/quick-capture.repository');
  const capture = await findCaptureById(context.db, context.organizationId, captureId);
  if (!capture) throw new NotFoundError('Quick capture');
  if (capture.status !== 'captured' && capture.status !== 'failed') {
    throw new ValidationError([{ path: 'status', message: 'Capture is not awaiting upload' }]);
  }
}
