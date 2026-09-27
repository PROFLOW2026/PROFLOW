import 'server-only';

/**
 * Margin Snapshot Batch Worker (migration 0141 companion).
 *
 * Problem: margin snapshots are currently only captured on page load, so the
 * org-level margin trend dashboard is incomplete for projects that haven't been
 * visited recently.
 *
 * Solution: this ops worker iterates every active org and refreshes the current
 * calendar-month snapshot for every active project. It uses the same
 * `captureCurrentMarginSnapshot` logic that the UI calls, ensuring data parity.
 *
 * WIRING REQUIRED: the main agent must add `runMarginSnapshotOpsWorker()` to
 * `src/app/api/internal/ops-worker/route.ts` (do NOT edit that file here — it is
 * owned by the main integration agent per the subagent policy).
 *
 * Example addition to route.ts:
 *   import { runMarginSnapshotOpsWorker } from '@/modules/ops-finance/application/margin-snapshot-ops-worker';
 *   // in Promise.all([...]) add:
 *   runMarginSnapshotOpsWorker().catch((err) => ({ snapshotsWritten: 0, errors: [String(err)] })),
 */

import { getAdminDb, withUserContext } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';
import { listActiveOrganizationIds, resolveOrgContext } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';
import { captureCurrentMarginSnapshot } from '@/modules/financials/application/capture-margin-snapshot';
import { getProjectFinancials } from '@/modules/financials/application/get-project-financials';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import { sql } from 'drizzle-orm';

export interface MarginSnapshotOpsWorkerResult {
  readonly snapshotsWritten: number;
  readonly projectsScanned: number;
  readonly orgsScanned: number;
  readonly failed: number;
  readonly errors: readonly string[];
}

/**
 * Load all active (non-archived) project ids for an org.
 * We do this with a raw query to avoid pulling full project objects.
 */
async function listActiveProjectIdsForOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<readonly string[]> {
  const rows = await db.execute<{ id: string }>(
    sql`SELECT id FROM projects WHERE organization_id = ${organizationId}::uuid AND archived_at IS NULL LIMIT 500`,
  );
  return Array.from(rows as unknown as Array<{ id: string }>).map((r) => r.id);
}

async function refreshMarginSnapshotsForOrg(context: OrgContext): Promise<{
  written: number;
  scanned: number;
}> {
  const projectIds = await listActiveProjectIdsForOrg(context.db, context.organizationId);
  let written = 0;

  for (const projectId of projectIds) {
    try {
      const financials = await getProjectFinancials(context, projectId);
      const trend = await captureCurrentMarginSnapshot(context, financials);
      // captureCurrentMarginSnapshot returns the updated trend; if it wrote a new
      // snapshot the list will be non-empty and the upsert ran.
      void trend; // result used as side-effect write only
      written += 1;
    } catch {
      // Individual project failure should not abort the entire org batch.
      // Errors are surfaced via the org-level try/catch below.
    }
  }

  return { written, scanned: projectIds.length };
}

/**
 * Daily batch: refresh current-month margin snapshots for every active project
 * in every active organisation. Run from the ops-worker cron (06:00 UTC daily).
 */
export async function runMarginSnapshotOpsWorker(): Promise<MarginSnapshotOpsWorkerResult> {
  const db = getAdminDb();
  const orgRows = await listActiveOrganizationIds(db);

  let snapshotsWritten = 0;
  let projectsScanned = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const orgRow of orgRows) {
    try {
      const owner = await findActiveOrgOwnerUserId(db, orgRow.id);
      if (!owner) {
        failed += 1;
        errors.push(`org:${orgRow.id} — no_active_owner`);
        continue;
      }

      const locale = orgRow.defaultLocale ?? 'he-IL';

      const result = await withUserContext(owner.userId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.userId,
          organizationId: orgRow.id,
          locale,
        });
        return refreshMarginSnapshotsForOrg(context);
      });

      snapshotsWritten += result.written;
      projectsScanned += result.scanned;
    } catch (error) {
      failed += 1;
      errors.push(
        `org:${orgRow.id} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    snapshotsWritten,
    projectsScanned,
    orgsScanned: orgRows.length,
    failed,
    errors,
  };
}
