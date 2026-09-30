import 'server-only';

import { listGeneratedArtifacts } from '@/modules/generated-documents/application/list-artifacts';
import { saveGeneratedReportToStorage } from '@/modules/generated-documents/application/save-generated-report';
import { relocateDocumentToSemanticFolder } from '@/modules/external-storage/application/relocate-document-file';
import { isOrganizationStorageConfigured } from '@/modules/external-storage/server';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

const approvedIdempotencyKey = (quoteId: string) => `quote-approved:${quoteId}`;

/**
 * Persist immutable approved quote PDF under org quotes_root (best-effort).
 * Requires QUOTES_MANAGE; uses quote_estimate save path (no separate DOCUMENTS_MANAGE gate).
 */
export async function saveApprovedQuoteArtifact(
  context: OrgContext,
  quoteId: string,
): Promise<{ saved: boolean; reason?: string }> {
  if (!hasPermission(context, PERMISSIONS.QUOTES_MANAGE)) {
    return { saved: false, reason: 'permission' };
  }
  const ready = await isOrganizationStorageConfigured(context);
  if (!ready) {
    return { saved: false, reason: 'storage' };
  }
  try {
    const result = await saveGeneratedReportToStorage(context, {
      kind: 'quote_estimate',
      entityId: quoteId,
      idempotencyKey: approvedIdempotencyKey(quoteId),
      forceNewVersion: false,
    });
    return { saved: result.status === 'saved' || result.status === 'idempotent' };
  } catch (error) {
    console.warn('[quotes] approved artifact save failed', {
      organizationId: context.organizationId,
      quoteId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { saved: false, reason: 'error' };
  }
}

/** Move generated quote PDFs into the project quotes folder after conversion. */
export async function relocateApprovedQuoteArtifactsToProject(
  context: OrgContext,
  quoteId: string,
  projectId: string,
): Promise<void> {
  if (!hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE)) return;
  const ready = await isOrganizationStorageConfigured(context);
  if (!ready) return;

  const artifacts = await listGeneratedArtifacts(context, {
    ownerType: 'organization',
    ownerId: context.organizationId,
    generatedKind: 'quote_estimate',
    sourceEntityId: quoteId,
  });

  for (const artifact of artifacts) {
    if (!artifact.documentId || !artifact.externalFileId) continue;
    try {
      await relocateDocumentToSemanticFolder(context, {
        documentId: artifact.documentId,
        projectId,
        semanticFolderType: 'quotes',
      });
    } catch (error) {
      console.warn('[quotes] relocate approved artifact failed', {
        organizationId: context.organizationId,
        quoteId,
        projectId,
        documentId: artifact.documentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
