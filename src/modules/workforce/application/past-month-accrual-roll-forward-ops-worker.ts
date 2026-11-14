import 'server-only';

import { getAdminDb, withUserContext } from '@/shared/db/client';
import { listActiveOrganizationIds, resolveOrgContext } from '@/modules/tenancy';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import { rotatedOrgOrder } from '@/modules/ops/application/ops-worker-budget';
import type { OrgContext } from '@/shared/auth/context';
import { rollForwardPastMonthEmployerAccrualsForOrg } from './ensure-open-monthly-labor-fresh';

export interface PastMonthAccrualRollForwardOpsWorkerResult {
  readonly orgsScanned: number;
  readonly employeeMonthsScanned: number;
  readonly recomputed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly deferredOrgs: number;
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

function dayOfYear(now: Date): number {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  return Math.floor((now.getTime() - start) / 86_400_000);
}

/**
 * Daily ops: promote prior-calendar-month open accruals to full recognition.
 * Includes company_only owners (no project touch). Bounded + idempotent.
 */
export async function runPastMonthAccrualRollForwardOpsWorker(options?: {
  readonly deadlineMs?: number;
  readonly now?: Date;
}): Promise<PastMonthAccrualRollForwardOpsWorkerResult> {
  const now = options?.now ?? new Date();
  const deadlineMs = options?.deadlineMs;
  const started = Date.now();
  const db = getAdminDb();
  const orgRows = rotatedOrgOrder(await listActiveOrganizationIds(db), dayOfYear(now));

  let employeeMonthsScanned = 0;
  let recomputed = 0;
  let skipped = 0;
  let failed = 0;
  let deferredOrgs = 0;
  const failures: { organizationId: string; error: string }[] = [];

  for (let index = 0; index < orgRows.length; index += 1) {
    const orgRow = orgRows[index]!;
    if (deadlineMs != null && Date.now() - started >= deadlineMs) {
      deferredOrgs = orgRows.length - index;
      break;
    }

    try {
      const owner = await findActiveOrgOwnerUserId(db, orgRow.id);
      if (!owner) {
        failed += 1;
        failures.push({ organizationId: orgRow.id, error: 'no_org_owner' });
        continue;
      }

      const locale = orgRow.defaultLocale || 'he-IL';
      const result = await withOrgOwnerContext(owner.userId, orgRow.id, locale, (context) =>
        rollForwardPastMonthEmployerAccrualsForOrg(context),
      );
      employeeMonthsScanned += result.scanned;
      recomputed += result.recomputed;
      skipped += result.skipped;
      failed += result.failed;
    } catch (error) {
      failed += 1;
      failures.push({
        organizationId: orgRow.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    orgsScanned: orgRows.length - deferredOrgs,
    employeeMonthsScanned,
    recomputed,
    skipped,
    failed,
    deferredOrgs,
    failures,
  };
}
