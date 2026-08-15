import 'server-only';

import { and, eq, isNull, lte } from 'drizzle-orm';
import {
  organizationMemberships,
  organizations,
  recurringFinancialDrafts,
  roleAssignments,
  roles,
} from '@drizzle/schema';
import { generateRecurringDraftNow } from './generate';
import type { OrgContext } from '@/shared/auth/context';
import { addDays, businessDate, todayInTimeZone } from '@/shared/dates';
import { getAdminDb, withUserContext } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';
import { resolveOrgContext } from '@/modules/tenancy';
import { runDueRecurringDrafts } from '../domain/ops-run';
import type { RecurringOpsRunResult } from '../domain/ops-run';

const MAX_TEMPLATES_PER_RUN = 40;

export type RecurringOpsWorkerResult = RecurringOpsRunResult;

export interface DueRecurringDraft {
  readonly id: string;
  readonly organizationId: string;
  readonly nextRunDate: string;
  readonly timezone: string;
  readonly locale: string;
}

export async function listDueActiveRecurringDrafts(
  db: DbExecutor,
): Promise<DueRecurringDraft[]> {
  const utcToday = todayInTimeZone('UTC');
  const horizon = addDays(utcToday, 1);
  const rows = await db
    .select({
      id: recurringFinancialDrafts.id,
      organizationId: recurringFinancialDrafts.organizationId,
      nextRunDate: recurringFinancialDrafts.nextRunDate,
      timezone: organizations.timezone,
      locale: organizations.defaultLocale,
    })
    .from(recurringFinancialDrafts)
    .innerJoin(organizations, eq(organizations.id, recurringFinancialDrafts.organizationId))
    .where(
      and(
        eq(recurringFinancialDrafts.status, 'active'),
        isNull(recurringFinancialDrafts.archivedAt),
        isNull(organizations.archivedAt),
        lte(recurringFinancialDrafts.nextRunDate, horizon),
      ),
    )
    .limit(MAX_TEMPLATES_PER_RUN * 4);

  return rows
    .filter((row) => {
      const today = todayInTimeZone(row.timezone || 'UTC');
      return businessDate(row.nextRunDate) <= today;
    })
    .slice(0, MAX_TEMPLATES_PER_RUN)
    .map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      nextRunDate: businessDate(row.nextRunDate),
      timezone: row.timezone || 'UTC',
      locale: row.locale || 'en',
    }));
}

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
 * Cron path: generate due active templates as drafts. One template failure
 * never aborts the run. Already-generated-today is success (idempotent).
 */
export async function generateDueRecurringDrafts(): Promise<RecurringOpsWorkerResult> {
  const db = getAdminDb();
  const due = await listDueActiveRecurringDrafts(db);
  return runDueRecurringDrafts({
    due,
    findOwner: (organizationId) => findActiveOrgOwnerUserId(db, organizationId),
    withActor: withOrgOwnerContext,
    generate: generateRecurringDraftNow,
  });
}
