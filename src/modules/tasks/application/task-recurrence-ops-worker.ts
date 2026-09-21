import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb, withUserContext } from '@/shared/db/client';
import { listActiveOrganizationIds, resolveOrgContext } from '@/modules/tenancy';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import { processTaskRecurrenceForOrg } from './process-recurrence-occurrences';

export interface TaskRecurrenceOpsWorkerResult {
  readonly scanned: number;
  readonly generated: number;
  readonly skipped: number;
  readonly materialized: number;
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
 * Daily cron path: expand recurrence occurrences and materialize due tasks per org.
 * Scheduled via /api/internal/ops-worker (vercel.json 06:00 UTC).
 */
export async function runTaskRecurrenceOpsWorker(): Promise<TaskRecurrenceOpsWorkerResult> {
  const db = getAdminDb();
  const orgRows = await listActiveOrganizationIds(db);

  let generated = 0;
  let skipped = 0;
  let materialized = 0;
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
      const result = await withOrgOwnerContext(owner.userId, orgRow.id, locale, async (context) =>
        processTaskRecurrenceForOrg(context),
      );

      generated += result.generated;
      skipped += result.skipped;
      materialized += result.materialized;
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
    generated,
    skipped,
    materialized,
    failed,
    failures,
  };
}
