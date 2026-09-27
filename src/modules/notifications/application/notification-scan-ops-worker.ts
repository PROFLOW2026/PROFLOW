import 'server-only';

import { getAdminDb, withUserContext } from '@/shared/db/client';
import { listActiveOrganizationIds, resolveOrgContext } from '@/modules/tenancy';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import type { OrgContext } from '@/shared/auth/context';
import { runNotificationScan } from './scan-conditions';

export interface NotificationScanOpsWorkerResult {
  readonly scanned: number;
  readonly emitted: number;
  readonly resolved: number;
  readonly failed: number;
  readonly failures: readonly { organizationId: string; error: string }[];
}

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

/**
 * Daily cron path: run the full 22-scanner notification scan across all orgs.
 * Scheduled via /api/internal/ops-worker (vercel.json 06:00 UTC).
 * Orgs are processed sequentially. Dedupe is handled by the SQL upsert in
 * app.emit_notification — no additional deduplication needed here.
 */
export async function runNotificationScanOpsWorker(): Promise<NotificationScanOpsWorkerResult> {
  const db = getAdminDb();
  const orgRows = await listActiveOrganizationIds(db);

  let emitted = 0;
  let resolved = 0;
  let failed = 0;
  const failures: { organizationId: string; error: string }[] = [];

  for (const orgRow of orgRows) {
    try {
      const owner = await findActiveOrgOwnerUserId(db, orgRow.id);
      if (!owner) {
        failed += 1;
        failures.push({ organizationId: orgRow.id, error: 'no_org_owner' });
        continue;
      }

      const locale = orgRow.defaultLocale || 'he-IL';
      const result = await withOrgOwnerContext(owner.userId, orgRow.id, locale, (context) =>
        runNotificationScan(context, { maxMs: 8000, perScannerCap: 25 }),
      );
      emitted += result.emitted;
      resolved += result.resolved;
    } catch (error) {
      failed += 1;
      failures.push({
        organizationId: orgRow.id,
        error: error instanceof Error && error.message.trim() ? error.message : 'unknown',
      });
    }
  }

  return {
    scanned: orgRows.length,
    emitted,
    resolved,
    failed,
    failures,
  };
}
