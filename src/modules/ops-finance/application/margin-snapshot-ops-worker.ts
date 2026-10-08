import 'server-only';

import { randomUUID } from 'node:crypto';
import { getAdminDb, withUserContext } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';
import { listActiveOrganizationIds } from '@/modules/tenancy/application/list-active-organization-ids';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import type { OrgContext } from '@/shared/auth/context';
import { captureCurrentMarginSnapshot } from '@/modules/financials/application/capture-margin-snapshot';
import { getProjectFinancials } from '@/modules/financials/application/get-project-financials';
import {
  readFinancialsBatchLoadMetrics,
  runWithFinancialsBatchLoadMetrics,
} from '@/modules/financials/application/financials-batch-load-metrics';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import { sql } from 'drizzle-orm';
import {
  decideMarginSnapshotBatchLease,
  markMarginSnapshotBatchCompleted,
  releaseMarginSnapshotBatchRunningLease,
} from './margin-snapshot-batch-lease';

export interface MarginSnapshotOpsWorkerResult {
  readonly snapshotsWritten: number;
  readonly projectsScanned: number;
  readonly orgsScanned: number;
  readonly failed: number;
  readonly errors: readonly string[];
  readonly skippedReason?: 'already_completed' | 'lease_held';
  readonly durationMs?: number;
  readonly apOrgBundleLoads?: number;
  readonly orgPreflightLoads?: number;
}

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
      void trend;
      written += 1;
    } catch {
      // Individual project failure should not abort the entire org batch.
    }
  }

  return { written, scanned: projectIds.length };
}

function logMarginSnapshotBatch(result: MarginSnapshotOpsWorkerResult): void {
  console.info('[ops/margin-snapshot-batch]', {
    orgsScanned: result.orgsScanned,
    projectsScanned: result.projectsScanned,
    snapshotsWritten: result.snapshotsWritten,
    failed: result.failed,
    durationMs: result.durationMs,
    apOrgBundleLoads: result.apOrgBundleLoads,
    orgPreflightLoads: result.orgPreflightLoads,
    skippedReason: result.skippedReason ?? null,
  });
}

/**
 * Daily batch: refresh current-month margin snapshots for every active project
 * in every active organisation. Run from the ops-worker cron (06:00 UTC daily).
 */
export async function runMarginSnapshotOpsWorker(): Promise<MarginSnapshotOpsWorkerResult> {
  const started = Date.now();
  const adminDb = getAdminDb();
  const batchToken = randomUUID();

  return runWithFinancialsBatchLoadMetrics(async () => {
    const lease = await decideMarginSnapshotBatchLease(adminDb, batchToken);
    if (lease.action === 'skip') {
      const skipped: MarginSnapshotOpsWorkerResult = {
        snapshotsWritten: 0,
        projectsScanned: 0,
        orgsScanned: 0,
        failed: 0,
        errors: [],
        skippedReason: lease.reason,
        durationMs: Date.now() - started,
        apOrgBundleLoads: 0,
        orgPreflightLoads: 0,
      };
      logMarginSnapshotBatch(skipped);
      return skipped;
    }

    const orgRows = await listActiveOrganizationIds(adminDb);

    let snapshotsWritten = 0;
    let projectsScanned = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      for (const orgRow of orgRows) {
        try {
          const owner = await findActiveOrgOwnerUserId(adminDb, orgRow.id);
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

      await markMarginSnapshotBatchCompleted(adminDb, lease.holderOrganizationId, batchToken);

      const metrics = readFinancialsBatchLoadMetrics();
      const result: MarginSnapshotOpsWorkerResult = {
        snapshotsWritten,
        projectsScanned,
        orgsScanned: orgRows.length,
        failed,
        errors,
        durationMs: Date.now() - started,
        apOrgBundleLoads: metrics?.apOrgBundleLoads ?? 0,
        orgPreflightLoads: metrics?.orgPreflightLoads ?? 0,
      };
      logMarginSnapshotBatch(result);
      return result;
    } catch (error) {
      await releaseMarginSnapshotBatchRunningLease(
        adminDb,
        lease.holderOrganizationId,
        batchToken,
      );
      throw error;
    }
  });
}
