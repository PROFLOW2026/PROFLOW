import 'server-only';

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { ServiceUnavailableError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  finalizeDocumentUpload,
  listAllDocuments,
  prepareDocumentUpload,
  softDeleteDocument,
  updateDocumentById,
} from '@/modules/documents';
import { isOrganizationStorageConfigured, uploadDocumentToExternalStorage } from '@/modules/external-storage/server';
import { assertReportKindPermission, generateReport, renderReportPdf } from '@/modules/reports';
import { buildGeneratedPdfFileName } from '../domain/filenames';
import {
  GENERATED_DOCUMENT_CATEGORY,
  generatedArtifactKey,
  serializeGeneratedDocumentTags,
} from '../domain/tags';
import type { SaveGeneratedDocumentResult, SaveGeneratedReportInput } from '../domain/types';
import { listGeneratedArtifacts, nextGeneratedVersion } from './list-artifacts';
import { resolveGeneratedDocumentBinding, resolveGeneratedFilenameContext } from './resolve-binding';
import { resolveGeneratedUploadFolderId } from './resolve-upload-folder';
import { markMonthlyWorkforceReportNotificationHandled } from './resolve-monthly-notification';

export async function saveGeneratedReportToStorage(
  context: OrgContext,
  raw: SaveGeneratedReportInput,
): Promise<SaveGeneratedDocumentResult> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  assertReportKindPermission(context, raw.kind);

  const storageReady = await isOrganizationStorageConfigured(context);
  if (!storageReady) {
    throw new ServiceUnavailableError(
      'Organization storage is not connected',
      'generatedDocuments.errors.storageNotConfigured',
    );
  }

  const binding = await resolveGeneratedDocumentBinding(
    context,
    raw.kind,
    raw.entityId,
    raw.reportMonth,
  );

  if (raw.idempotencyKey?.trim()) {
    const recent = await listAllDocuments(context.db, context.organizationId, {
      category: GENERATED_DOCUMENT_CATEGORY,
      tags: raw.idempotencyKey.trim(),
      limit: 3,
    });
    const hit = recent.find((doc) => doc.status === 'available');
    if (hit) {
      const tags = hit.tags ? JSON.parse(hit.tags) : null;
      if (raw.kind === 'monthly_workforce_report') {
        const month = raw.reportMonth ?? raw.entityId;
        await markMonthlyWorkforceReportNotificationHandled(context, month);
      }
      return {
        status: 'idempotent',
        documentId: hit.id,
        fileName: hit.originalFilename,
        version: typeof tags?.version === 'number' ? tags.version : 1,
      };
    }
  }

  const existing = await listGeneratedArtifacts(context, {
    ownerType: binding.ownerType,
    ownerId: binding.ownerId,
    generatedKind: raw.kind,
    sourceEntityId: binding.sourceEntityId,
    reportMonth: raw.reportMonth ?? (raw.kind === 'monthly_workforce_report' ? raw.entityId : null),
  });

  const artifactKey = generatedArtifactKey({
    generatedKind: raw.kind,
    sourceEntityId: binding.sourceEntityId,
    reportMonth: raw.reportMonth ?? (raw.kind === 'monthly_workforce_report' ? raw.entityId : null),
  });

  if (existing.length > 0 && !raw.forceNewVersion) {
    return {
      status: 'duplicate',
      existing: existing[0]!,
      artifactKey,
    };
  }

  const actualVersion = raw.forceNewVersion ? nextGeneratedVersion(existing) : 1;
  const filenameContext = await resolveGeneratedFilenameContext(
    context,
    raw.kind,
    raw.entityId,
    raw.reportMonth,
  );
  const fileName = buildGeneratedPdfFileName({
    kind: raw.kind,
    version: actualVersion,
    reportMonth: filenameContext.reportMonth,
    documentNumber: filenameContext.documentNumber,
    partyName: filenameContext.partyName,
    projectName: filenameContext.projectName,
  });

  const payload = await generateReport(context, {
    kind: raw.kind,
    id: raw.entityId,
    locale: context.locale,
  });
  const pdfBytes = await renderReportPdf(payload);
  console.info('[generated-save] pdf-rendered', {
    organizationId: context.organizationId,
    kind: raw.kind,
    entityId: raw.entityId,
    bytes: pdfBytes.length,
  });
  const generatedAt = new Date().toISOString();

  const tags = serializeGeneratedDocumentTags({
    pfGenerated: true,
    generatedKind: raw.kind,
    sourceEntityType: binding.sourceEntityType,
    sourceEntityId: binding.sourceEntityId,
    reportMonth: filenameContext.reportMonth,
    version: actualVersion,
    idempotencyKey: raw.idempotencyKey ?? null,
    generatedAt,
  });

  let documentId: string | undefined;
  try {
    const prepared = await prepareDocumentUpload(context, {
      fileName,
      mimeType: 'application/pdf',
      sizeBytes: pdfBytes.length,
      ownerType: binding.ownerType,
      ownerId: binding.ownerId,
      label: 'generated_pdf',
      privacyClass: binding.privacyClass ?? 'standard',
    });
    documentId = prepared.document.id;
    console.info('[generated-save] document-prepared', {
      organizationId: context.organizationId,
      documentId,
      fileName,
    });

    await updateDocumentById(context.db, context.organizationId, documentId, {
      category: GENERATED_DOCUMENT_CATEGORY,
      tags,
      originalFilename: fileName,
    });

    const parentFolderId = await resolveGeneratedUploadFolderId(context, binding);
    console.info('[generated-save] folder-resolved', {
      organizationId: context.organizationId,
      documentId,
      parentFolderId,
    });

    console.info('[generated-save] provider-upload-start', {
      organizationId: context.organizationId,
      documentId,
      fileName,
    });
    const uploaded = await uploadDocumentToExternalStorage(context, {
      documentId,
      parentSemanticFolder: binding.semanticFolder,
      entityType: binding.folderEntityType,
      entityId: binding.folderEntityId,
      resolvedParentFolderId: parentFolderId,
      fileName,
      mimeType: 'application/pdf',
      body: pdfBytes,
      sizeBytes: pdfBytes.length,
    });
    console.info('[generated-save] provider-upload-success', {
      organizationId: context.organizationId,
      documentId,
      externalFileId: uploaded.id,
    });

    await finalizeDocumentUpload(context, {
      documentId,
      sizeBytes: pdfBytes.length,
    });
    console.info('[generated-save] finalized', {
      organizationId: context.organizationId,
      documentId,
    });

    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
      entityType: 'document',
      entityId: documentId,
      after: {
        generatedKind: raw.kind,
        sourceEntityId: binding.sourceEntityId,
        version: actualVersion,
        externalFileId: uploaded.id,
      },
    });
    console.info('[generated-save] audit-recorded', {
      organizationId: context.organizationId,
      documentId,
    });

    if (raw.kind === 'monthly_workforce_report') {
      const month = raw.reportMonth ?? raw.entityId;
      await markMonthlyWorkforceReportNotificationHandled(context, month);
      console.info('[generated-save] notification-handled', {
        organizationId: context.organizationId,
        reportMonth: month,
      });
    }

    return {
      status: 'saved',
      documentId,
      fileName,
      version: actualVersion,
      externalFileId: uploaded.id,
    };
  } catch (error) {
    if (documentId) {
      try {
        await softDeleteDocument(context, { documentId });
      } catch {
        // best-effort cleanup
      }
    }
    throw error;
  }
}
