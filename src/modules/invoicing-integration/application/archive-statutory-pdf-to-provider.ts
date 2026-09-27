import 'server-only';

/**
 * SUMIT PDF archival to external storage — Task 1 (best-effort, non-blocking).
 *
 * After a successful SUMIT issuance this module downloads the PDF from SUMIT
 * and uploads it to the org's configured external storage provider under a
 * "statutory-documents" sub-folder. The result (provider file ID / web URL)
 * is stored in `external_statutory_documents.storage_reference`.
 *
 * IMPORTANT contract guarantees:
 *  - Issuance success is NEVER rolled back because archival fails.
 *  - If no external storage is configured, `archive_pending` is set to TRUE
 *    so a future retry can pick it up.
 *  - This function is invoked with `void` (fire-and-forget) — callers must
 *    not await it in the primary issuance path.
 */

import { withUserContext } from '@/shared/db/client';
import { resolveOrgContext } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';
import { uploadBytesToOrgStorageFolder } from '@/modules/external-storage/server';
import { findExternalDocument, updateExternalDocument } from '../data/external-documents';
import { buildStatutoryPdfFileName } from '../domain/statutory-pdf-filename';
import { SUMIT_PROVIDER_ID } from '../domain/types';
import { resolveStatutoryProviderForOrg } from './resolve-statutory-provider';
import { SumitStatutoryProvider } from '../providers/sumit/sumit-statutory-provider';
import type { ExternalDocumentPatch } from '../data/external-documents.repository';

const STATUTORY_DOCS_FOLDER = 'statutory-documents';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function withOrgOwnerContext<T>(
  userId: string,
  organizationId: string,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  return withUserContext(userId, async (tx) => {
    const context = await resolveOrgContext(tx, { userId, organizationId, locale: 'he-IL' });
    return fn(context);
  });
}

/** Set archive_pending=true and record the error without throwing. */
async function markArchiveFailed(
  userId: string,
  organizationId: string,
  externalDocumentId: string,
  reason: string,
): Promise<void> {
  try {
    const patch: ExternalDocumentPatch = {
      archivePending: true,
      archiveError: reason.slice(0, 500),
    };
    await withOrgOwnerContext(userId, organizationId, (ctx) =>
      updateExternalDocument(ctx, externalDocumentId, patch),
    );
  } catch {
    // Best-effort — do not throw again.
  }
}

// ─── public entry point ───────────────────────────────────────────────────────

/**
 * Downloads the SUMIT PDF for `externalDocumentId` and saves it to the org's
 * external storage provider. Marks the record as `archive_pending` on any error.
 *
 * @param userId              Actor user ID (org owner or issuer).
 * @param organizationId      Tenant ID.
 * @param externalDocumentId  PK of `external_statutory_documents`.
 */
export async function archiveStatutoryPdfToProvider(
  userId: string,
  organizationId: string,
  externalDocumentId: string,
): Promise<void> {
  try {
    await withOrgOwnerContext(userId, organizationId, async (context) => {
      // 1. Load the statutory document row.
      const doc = await findExternalDocument(context, externalDocumentId);
      if (!doc) {
        throw new Error(`ExternalStatutoryDocument ${externalDocumentId} not found`);
      }
      if (doc.issuanceOutcome !== 'confirmed_created' || !doc.externalId) {
        throw new Error(
          `Document ${externalDocumentId} is not in confirmed_created state (outcome=${doc.issuanceOutcome})`,
        );
      }

      // Idempotency: already archived.
      if (doc.storageReference && doc.archivedAt) {
        return;
      }

      // 2. Only SUMIT PDFs are supported for automatic archival.
      if (doc.providerId !== SUMIT_PROVIDER_ID) {
        throw new Error(`Provider ${doc.providerId} does not support automatic PDF archival`);
      }

      // 3. Resolve the configured SUMIT provider for this org.
      const provider = await resolveStatutoryProviderForOrg(context);
      if (!(provider instanceof SumitStatutoryProvider) || !provider.isConfigured()) {
        throw new Error('SUMIT provider is not configured for this org');
      }

      // 4. Download the PDF from SUMIT.
      const pdf = await provider.fetchDocumentPdf(doc.externalId);
      const fileName = buildStatutoryPdfFileName(doc.externalNumber);

      // 5. Upload to org's external storage (best-effort; returns null if none configured).
      const uploadResult = await uploadBytesToOrgStorageFolder(context, {
        subfolderName: STATUTORY_DOCS_FOLDER,
        fileName,
        mimeType: pdf.contentType,
        body: pdf.bytes,
        sizeBytes: pdf.bytes.length,
      });

      if (!uploadResult) {
        // No external storage configured — mark pending for future retry.
        const patch: ExternalDocumentPatch = {
          archivePending: true,
          archiveError: 'no_external_storage_configured',
        };
        await updateExternalDocument(context, externalDocumentId, patch);
        return;
      }

      // 6. Persist the storage reference on the document record.
      const storageReference = uploadResult.webUrl ?? uploadResult.providerFileId;
      const patch: ExternalDocumentPatch = {
        storageReference,
        archivedAt: new Date().toISOString(),
        archivePending: false,
        archiveError: null,
      };
      await updateExternalDocument(context, externalDocumentId, patch);
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.message.trim() ? error.message : 'unknown_archival_error';
    console.error(
      `[sumit-archival] archival failed for ${externalDocumentId} (org=${organizationId}): ${reason}`,
    );
    await markArchiveFailed(userId, organizationId, externalDocumentId, reason);
  }
}

/**
 * Retry helper: attempt archival for a document that is already flagged
 * `archive_pending=true`. Used by the retroactive scanner and the recovery
 * worker to process deferred archives.
 *
 * Returns `'archived'` on success, `'pending'` when storage is still not
 * configured, or `'error'` if the attempt failed for another reason.
 */
export async function retryPendingStatutoryPdfArchival(
  userId: string,
  organizationId: string,
  externalDocumentId: string,
): Promise<'archived' | 'pending' | 'error'> {
  try {
    await archiveStatutoryPdfToProvider(userId, organizationId, externalDocumentId);

    // Re-read to see if it succeeded or is still pending.
    let archived = false;
    await withUserContext(userId, async (tx) => {
      const context = await resolveOrgContext(tx, { userId, organizationId, locale: 'he-IL' });
      const doc = await findExternalDocument(context, externalDocumentId);
      archived = Boolean(doc?.storageReference && doc.archivedAt && !doc.archivePending);
    });
    return archived ? 'archived' : 'pending';
  } catch {
    return 'error';
  }
}
