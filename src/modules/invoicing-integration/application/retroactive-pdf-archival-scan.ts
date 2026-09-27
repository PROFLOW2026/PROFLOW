import 'server-only';

/**
 * Retroactive SUMIT PDF Archival Scanner — Task 4.
 *
 * One-time (or on-demand) utility: scans all `external_statutory_documents`
 * rows that have been successfully issued by SUMIT (confirmed_created) but
 * have no `storage_reference` yet, and marks them `archive_pending = TRUE`.
 *
 * Once marked, the daily ops-worker (via `runSumitRecoveryOpsWorker`) will
 * not pick these up automatically because it only processes *ambiguous* docs.
 * Instead the caller (an admin script or a manual trigger) should call
 * `retryPendingStatutoryPdfArchival` for each returned ID — or simply rely
 * on the fact that `archive_pending = TRUE` rows are queryable for a
 * dedicated follow-up job.
 *
 * This function does NOT run automatically.  Call it from a one-time script
 * or an admin action when you want to retroactively archive existing PDFs.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { externalStatutoryDocuments } from '@drizzle/schema';
import { getAdminDb, withUserContext } from '@/shared/db/client';
import { resolveOrgContext } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import { updateExternalDocument, listExternalDocumentsByIssuanceOutcome } from '../data/external-documents';
import { SUMIT_PROVIDER_ID } from '../domain/types';
import type { ExternalDocumentPatch } from '../data/external-documents.repository';

export interface RetroactiveArchivalScanResult {
  /** Total org-level rows scanned. */
  readonly orgsScanned: number;
  /** Documents marked archive_pending in this run. */
  readonly queued: number;
  /** Documents already archived (skipped). */
  readonly alreadyArchived: number;
  /** Documents skipped for other reasons (non-SUMIT provider, etc.). */
  readonly skipped: number;
  /** Errors encountered. */
  readonly errors: readonly { organizationId: string; documentId?: string; error: string }[];
}

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

/** Return distinct org IDs that have at least one confirmed_created SUMIT doc
 *  without a storage_reference. */
async function findOrgsWithUnarchived(): Promise<string[]> {
  const db = getAdminDb();
  const rows = await db
    .selectDistinct({ organizationId: externalStatutoryDocuments.organizationId })
    .from(externalStatutoryDocuments)
    .where(
      and(
        eq(externalStatutoryDocuments.issuanceOutcome, 'confirmed_created'),
        eq(externalStatutoryDocuments.providerId, SUMIT_PROVIDER_ID),
        isNull(externalStatutoryDocuments.storageReference),
      ),
    );
  return rows.map((r) => r.organizationId);
}

// ─── public entry point ───────────────────────────────────────────────────────

/**
 * Scan existing confirmed SUMIT documents that have no `storage_reference`
 * and mark them `archive_pending = TRUE` so they can be retried.
 *
 * Safe to call multiple times — already-marked docs are counted as skipped.
 *
 * @param dryRun  When `true`, collect stats without writing to the DB.
 */
export async function scanAndQueueRetroactiveStatutoryPdfArchival(
  dryRun = false,
): Promise<RetroactiveArchivalScanResult> {
  const db = getAdminDb();
  const orgIds = await findOrgsWithUnarchived();

  let queued = 0;
  let alreadyArchived = 0;
  let skipped = 0;
  const errors: { organizationId: string; documentId?: string; error: string }[] = [];

  for (const organizationId of orgIds) {
    try {
      const owner = await findActiveOrgOwnerUserId(db, organizationId);
      if (!owner) {
        errors.push({ organizationId, error: 'no_org_owner' });
        continue;
      }

      await withOrgOwnerContext(owner.userId, organizationId, async (context) => {
        const confirmedDocs = await listExternalDocumentsByIssuanceOutcome(
          context,
          'confirmed_created',
        );

        for (const doc of confirmedDocs) {
          // Only SUMIT docs.
          if (doc.providerId !== SUMIT_PROVIDER_ID) {
            skipped += 1;
            continue;
          }
          // Already archived.
          if (doc.storageReference && doc.archivedAt) {
            alreadyArchived += 1;
            continue;
          }
          // Already queued.
          if (doc.archivePending) {
            skipped += 1;
            continue;
          }
          // No SUMIT external ID — cannot archive.
          if (!doc.externalId) {
            skipped += 1;
            continue;
          }

          if (!dryRun) {
            const patch: ExternalDocumentPatch = {
              archivePending: true,
              archiveError: 'retroactive_scan_queued',
            };
            try {
              await updateExternalDocument(context, doc.id, patch);
              queued += 1;
            } catch (err) {
              errors.push({
                organizationId,
                documentId: doc.id,
                error: err instanceof Error ? err.message : 'update_failed',
              });
            }
          } else {
            // Dry run — just count.
            queued += 1;
          }
        }
      });
    } catch (error) {
      errors.push({
        organizationId,
        error: error instanceof Error && error.message.trim() ? error.message : 'unknown',
      });
    }
  }

  return {
    orgsScanned: orgIds.length,
    queued,
    alreadyArchived,
    skipped,
    errors,
  };
}
