import 'server-only';

import { and, eq } from 'drizzle-orm';
import {
  organizationMemberships,
  roleAssignments,
  roles,
} from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb, withUserContext } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';
import { resolveOrgContext, listActiveOrganizationIds } from '@/modules/tenancy';
import { ensureRecurringDraftOccurrencesOnly } from './ensure-occurrences';
import type { RecurringOpsRunResult } from '../domain/ops-run';
import { syncAutomaticExpensePayments } from '@/modules/expenses/application/expense-payments';
import { todayInTimeZone } from '@/shared/dates';

export type RecurringOpsWorkerResult = RecurringOpsRunResult;

export async function findActiveOrgOwnerUserId(
  db: DbExecutor,
  organizationId: string,
): Promise<{ readonly userId: string } | null> {
  const [row] = await db
    .select({ userId: roleAssignments.userId })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.id, roleAssignments.membershipId),
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, 'active'),
      ),
    )
    .where(and(eq(roleAssignments.organizationId, organizationId), eq(roles.key, 'owner')))
    .limit(1);
  return row?.userId ? { userId: row.userId } : null;
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
 * Daily cron path: for every active organization —
 * 1) ensure recurring expense occurrences through today
 * 2) apply org automatic_on_due payment confirmations (installments, singles, recurring)
 *
 * Scheduled: vercel.json → `/api/internal/ops-worker` at 06:00 UTC daily.
 */
export async function generateDueRecurringDrafts(): Promise<RecurringOpsWorkerResult> {
  const db = getAdminDb();
  const orgRows = await listActiveOrganizationIds(db);

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let paymentsApplied = 0;
  const failures: { draftId: string; error: string }[] = [];

  for (const orgRow of orgRows) {
    try {
      const owner = await findActiveOrgOwnerUserId(db, orgRow.id);
      if (!owner) {
        failed += 1;
        failures.push({ draftId: orgRow.id, error: 'no_org_owner' });
        continue;
      }

      const locale = orgRow.defaultLocale || 'he-IL';

      const result = await withOrgOwnerContext(owner.userId, orgRow.id, locale, async (context) => {
        const today = todayInTimeZone(context.organization.timezone);
        const occurrenceResult = await ensureRecurringDraftOccurrencesOnly(context);
        const payments = await syncAutomaticExpensePayments(context, today);
        return { occurrenceResult, payments };
      });

      generated += result.occurrenceResult.monthsGenerated;
      skipped += result.occurrenceResult.skippedExisting;
      paymentsApplied += result.payments;
    } catch (error) {
      failed += 1;
      failures.push({
        draftId: orgRow.id,
        error: error instanceof Error && error.message.trim() ? error.message : 'unknown',
      });
    }
  }

  return {
    scanned: orgRows.length,
    generated,
    skipped,
    failed,
    paymentsApplied,
    failures,
  };
}
