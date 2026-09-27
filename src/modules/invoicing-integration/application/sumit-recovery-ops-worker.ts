import 'server-only';

/**
 * SUMIT Ambiguous Recovery Worker — Task 2.
 *
 * Documents that timed-out during issuance are left in `issuance_outcome =
 * 'ambiguous'`. Without intervention they stay stuck forever. This worker
 * runs on the daily ops-worker schedule and polls SUMIT for each ambiguous
 * document that has been in that state for more than 5 minutes (to avoid
 * race conditions with in-flight issuances).
 *
 * Pattern: mirrors `task-reminder-ops-worker.ts` — iterate orgs, process
 * each sequentially, collect counters.
 *
 * Safety guarantees:
 *  - Only processes documents where `updatedAt < now() − 5 min`.
 *  - Never creates duplicate statutory documents (only updates existing rows).
 *  - Idempotent: calling multiple times produces the same outcome.
 */

import { and, eq, lt } from 'drizzle-orm';
import { externalStatutoryDocuments } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb, withUserContext } from '@/shared/db/client';
import { resolveOrgContext } from '@/modules/tenancy';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import { listExternalDocumentsByIssuanceOutcome } from '../data/external-documents';
import { refreshExternalStatutoryStatus } from './refresh-external-status';

const AMBIGUOUS_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

export interface SumitRecoveryOpsWorkerResult {
  /** Number of organisations scanned (those with at least one connected SUMIT setup). */
  readonly scanned: number;
  /** Number of ambiguous documents that were successfully resolved. */
  readonly resolved: number;
  /** Number of documents that still could not be resolved. */
  readonly still_ambiguous: number;
  /** Number of per-org failures. */
  readonly failed: number;
  readonly failures: readonly { organizationId: string; error: string }[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function withOrgOwnerContext<T>(
  userId: string,
  organizationId: string,
  locale: string,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  return withUserContext(userId, async (tx) => {
    const context = await resolveOrgContext(tx, { userId, organizationId, locale });
    return fn(context);
  });
}

/** Find distinct org IDs that have at least one stale-ambiguous document. */
async function findOrgsWithStaleAmbiguousDocs(): Promise<string[]> {
  const db = getAdminDb();
  const cutoff = new Date(Date.now() - AMBIGUOUS_GRACE_PERIOD_MS);
  const rows = await db
    .selectDistinct({ organizationId: externalStatutoryDocuments.organizationId })
    .from(externalStatutoryDocuments)
    .where(
      and(
        eq(externalStatutoryDocuments.issuanceOutcome, 'ambiguous'),
        lt(externalStatutoryDocuments.updatedAt, cutoff),
      ),
    );
  return rows.map((r) => r.organizationId);
}

async function processOrg(
  context: OrgContext,
): Promise<{ resolved: number; still_ambiguous: number }> {
  const cutoff = new Date(Date.now() - AMBIGUOUS_GRACE_PERIOD_MS).toISOString();

  // Get all ambiguous docs for this org.
  const ambiguousDocs = await listExternalDocumentsByIssuanceOutcome(context, 'ambiguous');

  // Filter to only those that have been stale long enough.
  const staleDocs = ambiguousDocs.filter((doc) => doc.updatedAt < cutoff);

  let resolved = 0;
  let still_ambiguous = 0;

  for (const doc of staleDocs) {
    try {
      const refreshed = await refreshExternalStatutoryStatus(context, {
        externalDocumentId: doc.id,
      });
      // If the refresh moved it out of 'ambiguous', count as resolved.
      if (refreshed.issuanceOutcome !== 'ambiguous') {
        resolved += 1;
      } else {
        still_ambiguous += 1;
      }
    } catch {
      // Individual document failures don't abort the org scan.
      still_ambiguous += 1;
    }
  }

  return { resolved, still_ambiguous };
}

// ─── public entry point ───────────────────────────────────────────────────────

/**
 * Run the SUMIT ambiguous recovery scan.
 * Called by the daily ops-worker at `/api/internal/ops-worker`.
 */
export async function runSumitRecoveryOpsWorker(): Promise<SumitRecoveryOpsWorkerResult> {
  const db = getAdminDb();
  const orgIds = await findOrgsWithStaleAmbiguousDocs();

  let resolved = 0;
  let still_ambiguous = 0;
  let failed = 0;
  const failures: { organizationId: string; error: string }[] = [];

  for (const organizationId of orgIds) {
    try {
      const owner = await findActiveOrgOwnerUserId(db, organizationId);
      if (!owner) {
        failed += 1;
        failures.push({ organizationId, error: 'no_org_owner' });
        continue;
      }

      const locale = 'he-IL';
      const result = await withOrgOwnerContext(
        owner.userId,
        organizationId,
        locale,
        (context) => processOrg(context),
      );
      resolved += result.resolved;
      still_ambiguous += result.still_ambiguous;
    } catch (error) {
      failed += 1;
      failures.push({
        organizationId,
        error: error instanceof Error && error.message.trim() ? error.message : 'unknown',
      });
    }
  }

  return {
    scanned: orgIds.length,
    resolved,
    still_ambiguous,
    failed,
    failures,
  };
}
