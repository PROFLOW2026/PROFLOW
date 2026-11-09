import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb, withUserContext } from '@/shared/db/client';
import { listActiveOrganizationIds, resolveOrgContext } from '@/modules/tenancy';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import { runScheduledAutomationScans } from './run-rules';

export interface AutomationScanOpsWorkerResult {
  readonly scanned: number;
  readonly rulesScanned: number;
  readonly runsRecorded: number;
  readonly matchesNotified: number;
  readonly entitiesSkippedDuplicate: number;
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
 * Daily ops path: run scheduled automation scans (notify-only) for enabled task presets.
 */
export async function runAutomationScanOpsWorker(): Promise<AutomationScanOpsWorkerResult> {
  const db = getAdminDb();
  const orgRows = await listActiveOrganizationIds(db);

  let rulesScanned = 0;
  let runsRecorded = 0;
  let matchesNotified = 0;
  let entitiesSkippedDuplicate = 0;
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
        runScheduledAutomationScans(context),
      );
      rulesScanned += result.rulesScanned;
      runsRecorded += result.runsRecorded;
      matchesNotified += result.matchesNotified;
      entitiesSkippedDuplicate += result.entitiesSkippedDuplicate;
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
    rulesScanned,
    runsRecorded,
    matchesNotified,
    entitiesSkippedDuplicate,
    failed,
    failures,
  };
}
