import 'server-only';

import { and, eq } from 'drizzle-orm';
import {
  organizationMemberships,
  organizations,
  roleAssignments,
  roles,
} from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb, withUserContext } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';
import { resolveOrgContext } from '@/modules/tenancy';
import { ensureRecurringDraftOccurrencesForOrg } from './ensure-occurrences';
import type { RecurringOpsRunResult } from '../domain/ops-run';
import { listOrgIdsWithActiveRecurringExpenseDrafts } from '../data/recurring-drafts.repository';

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
 * Cron path: ensure missing monthly occurrences through today for every org
 * with active expense templates, then sync automatic payments.
 */
export async function generateDueRecurringDrafts(): Promise<RecurringOpsWorkerResult> {
  const db = getAdminDb();
  const orgIds = await listOrgIdsWithActiveRecurringExpenseDrafts(db);

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const failures: { draftId: string; error: string }[] = [];

  for (const organizationId of orgIds) {
    try {
      const owner = await findActiveOrgOwnerUserId(db, organizationId);
      if (!owner) {
        failed += 1;
        failures.push({ draftId: organizationId, error: 'no_org_owner' });
        continue;
      }

      const [orgRow] = await db
        .select({ locale: organizations.defaultLocale })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
      const locale = orgRow?.locale || 'he-IL';

      const result = await withOrgOwnerContext(owner.userId, organizationId, locale, (context) =>
        ensureRecurringDraftOccurrencesForOrg(context),
      );
      generated += result.monthsGenerated;
      skipped += result.skippedExisting;
    } catch (error) {
      failed += 1;
      failures.push({
        draftId: organizationId,
        error: error instanceof Error && error.message.trim() ? error.message : 'unknown',
      });
    }
  }

  return {
    scanned: orgIds.length,
    generated,
    skipped,
    failed,
    failures,
  };
}
