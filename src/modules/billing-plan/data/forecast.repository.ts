/**
 * Forecast helpers for expected (not issued) progress billing from active plans.
 */

import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import {
  billingRecords,
  projectBillingCycles,
  projectBillingPlanLines,
  projectBillingPlans,
  projects,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { addDays, type BusinessDate } from '@/shared/dates';

export interface ExpectedProgressBillingRow {
  readonly lineId: string;
  readonly planId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly label: string;
  readonly agreedAmount: string;
  readonly currency: string;
  readonly targetDate: BusinessDate;
}

/**
 * Active plan lines with a target_date inside [from, to] (inclusive).
 * Remaining/billed math is applied by the cash-flow caller.
 */
export async function listExpectedProgressBillingLines(
  db: DbExecutor,
  organizationId: string,
  from: BusinessDate,
  to: BusinessDate,
): Promise<ExpectedProgressBillingRow[]> {
  const rows = await db
    .select({
      lineId: projectBillingPlanLines.id,
      planId: projectBillingPlans.id,
      projectId: projectBillingPlans.projectId,
      projectName: projects.name,
      label: projectBillingPlanLines.label,
      agreedAmount: projectBillingPlanLines.agreedAmount,
      currency: projectBillingPlans.currency,
      targetDate: projectBillingPlanLines.targetDate,
    })
    .from(projectBillingPlanLines)
    .innerJoin(
      projectBillingPlans,
      and(
        eq(projectBillingPlans.id, projectBillingPlanLines.planId),
        eq(projectBillingPlans.organizationId, projectBillingPlanLines.organizationId),
      ),
    )
    .innerJoin(
      projects,
      and(
        eq(projects.id, projectBillingPlans.projectId),
        eq(projects.organizationId, projectBillingPlans.organizationId),
      ),
    )
    .where(
      and(
        eq(projectBillingPlanLines.organizationId, organizationId),
        eq(projectBillingPlans.status, 'active'),
        eq(projectBillingPlanLines.isArchived, false),
        isNull(projects.archivedAt),
        isNotNull(projectBillingPlanLines.targetDate),
        gte(projectBillingPlanLines.targetDate, from),
        lte(projectBillingPlanLines.targetDate, to),
        sql`${projectBillingPlanLines.agreedAmount}::numeric > 0`,
      ),
    )
    .orderBy(asc(projectBillingPlanLines.targetDate));

  return rows
    .filter((row): row is typeof row & { targetDate: string } => Boolean(row.targetDate))
    .map((row) => ({
      lineId: row.lineId,
      planId: row.planId,
      projectId: row.projectId,
      projectName: row.projectName,
      label: row.label,
      agreedAmount: row.agreedAmount,
      currency: row.currency,
      targetDate: row.targetDate as BusinessDate,
    }));
}

export async function listDraftCyclesAwaitingIssue(
  db: DbExecutor,
  organizationId: string,
  limit = 15,
): Promise<
  ReadonlyArray<{
    readonly cycleId: string;
    readonly planId: string;
    readonly projectId: string;
    readonly projectName: string;
    readonly title: string;
    readonly cycleNumber: number;
    readonly accountDate: string;
    readonly status: string;
  }>
> {
  const rows = await db
    .select({
      cycleId: projectBillingCycles.id,
      planId: projectBillingCycles.planId,
      projectId: projectBillingCycles.projectId,
      projectName: projects.name,
      title: projectBillingCycles.title,
      cycleNumber: projectBillingCycles.cycleNumber,
      accountDate: projectBillingCycles.accountDate,
      status: projectBillingCycles.status,
    })
    .from(projectBillingCycles)
    .innerJoin(
      projects,
      and(
        eq(projects.id, projectBillingCycles.projectId),
        eq(projects.organizationId, projectBillingCycles.organizationId),
      ),
    )
    .where(
      and(
        eq(projectBillingCycles.organizationId, organizationId),
        inArray(projectBillingCycles.status, ['draft', 'ready']),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(asc(projectBillingCycles.accountDate))
    .limit(limit);

  return rows;
}

export async function listMilestoneLinesDue(
  db: DbExecutor,
  organizationId: string,
  asOf: BusinessDate,
  withinDays: number,
  limit = 15,
): Promise<
  ReadonlyArray<{
    readonly lineId: string;
    readonly planId: string;
    readonly projectId: string;
    readonly projectName: string;
    readonly label: string;
    readonly targetDate: string;
    readonly milestoneLabel: string | null;
  }>
> {
  const until = addDays(asOf, withinDays);

  const rows = await db
    .select({
      lineId: projectBillingPlanLines.id,
      planId: projectBillingPlans.id,
      projectId: projectBillingPlans.projectId,
      projectName: projects.name,
      label: projectBillingPlanLines.label,
      targetDate: projectBillingPlanLines.targetDate,
      milestoneLabel: projectBillingPlanLines.milestoneLabel,
    })
    .from(projectBillingPlanLines)
    .innerJoin(
      projectBillingPlans,
      and(
        eq(projectBillingPlans.id, projectBillingPlanLines.planId),
        eq(projectBillingPlans.organizationId, projectBillingPlanLines.organizationId),
      ),
    )
    .innerJoin(
      projects,
      and(
        eq(projects.id, projectBillingPlans.projectId),
        eq(projects.organizationId, projectBillingPlans.organizationId),
      ),
    )
    .where(
      and(
        eq(projectBillingPlanLines.organizationId, organizationId),
        eq(projectBillingPlans.status, 'active'),
        eq(projectBillingPlanLines.isArchived, false),
        isNull(projects.archivedAt),
        isNotNull(projectBillingPlanLines.targetDate),
        lte(projectBillingPlanLines.targetDate, until),
      ),
    )
    .orderBy(asc(projectBillingPlanLines.targetDate))
    .limit(limit);

  return rows
    .filter((row) => row.targetDate)
    .map((row) => ({
      lineId: row.lineId,
      planId: row.planId,
      projectId: row.projectId,
      projectName: row.projectName,
      label: row.milestoneLabel?.trim() || row.label,
      targetDate: row.targetDate!,
      milestoneLabel: row.milestoneLabel,
    }));
}

/**
 * Active/completed plans with positive retention still held on linked billing records.
 * One row per plan (aggregated) to keep notification scans spam-free.
 */
export async function listPlansWithRetentionHeld(
  db: DbExecutor,
  organizationId: string,
  limit = 15,
): Promise<
  ReadonlyArray<{
    readonly planId: string;
    readonly projectId: string;
    readonly projectName: string;
    readonly planName: string;
    readonly heldRemaining: string;
    readonly currency: string;
  }>
> {
  const rows = await db
    .select({
      planId: projectBillingPlans.id,
      projectId: projectBillingPlans.projectId,
      projectName: projects.name,
      planName: projectBillingPlans.name,
      currency: projectBillingPlans.currency,
      heldRemaining: sql<string>`sum(${billingRecords.retentionHeldRemaining}::numeric)::text`,
    })
    .from(projectBillingPlans)
    .innerJoin(
      projects,
      and(
        eq(projects.id, projectBillingPlans.projectId),
        eq(projects.organizationId, projectBillingPlans.organizationId),
      ),
    )
    .innerJoin(
      projectBillingCycles,
      and(
        eq(projectBillingCycles.planId, projectBillingPlans.id),
        eq(projectBillingCycles.organizationId, projectBillingPlans.organizationId),
        inArray(projectBillingCycles.status, [
          'submitted',
          'partially_approved',
          'approved',
        ]),
        isNotNull(projectBillingCycles.billingRecordId),
      ),
    )
    .innerJoin(
      billingRecords,
      and(
        eq(billingRecords.id, projectBillingCycles.billingRecordId),
        eq(billingRecords.organizationId, projectBillingCycles.organizationId),
        eq(billingRecords.sourceKind, 'billing_plan'),
      ),
    )
    .where(
      and(
        eq(projectBillingPlans.organizationId, organizationId),
        inArray(projectBillingPlans.status, ['active', 'completed']),
        isNull(projectBillingPlans.archivedAt),
        isNull(projects.archivedAt),
        isNull(billingRecords.archivedAt),
        sql`${billingRecords.retentionHeldRemaining}::numeric > 0`,
      ),
    )
    .groupBy(
      projectBillingPlans.id,
      projectBillingPlans.projectId,
      projects.name,
      projectBillingPlans.name,
      projectBillingPlans.currency,
    )
    .orderBy(asc(projects.name))
    .limit(limit);

  return rows.map((row) => ({
    planId: row.planId,
    projectId: row.projectId,
    projectName: row.projectName,
    planName: row.planName,
    heldRemaining: row.heldRemaining,
    currency: row.currency,
  }));
}

/**
 * Projects with remaining retention held on billing_plan-sourced AR.
 * One row per project (sum of held remaining). Tables may be absent — callers catch.
 */
export async function listBillingPlanRetentionReleaseDue(
  db: DbExecutor,
  organizationId: string,
  limit = 15,
): Promise<
  ReadonlyArray<{
    readonly projectId: string;
    readonly projectName: string;
    readonly heldRemaining: string;
    readonly currency: string;
    readonly recordCount: number;
  }>
> {
  const rows = await db
    .select({
      projectId: billingRecords.projectId,
      projectName: projects.name,
      heldRemaining: sql<string>`sum(${billingRecords.retentionHeldRemaining}::numeric)::text`,
      currency: billingRecords.currency,
      recordCount: sql<number>`count(*)::int`,
    })
    .from(billingRecords)
    .innerJoin(
      projects,
      and(
        eq(projects.id, billingRecords.projectId),
        eq(projects.organizationId, billingRecords.organizationId),
      ),
    )
    .where(
      and(
        eq(billingRecords.organizationId, organizationId),
        eq(billingRecords.sourceKind, 'billing_plan'),
        isNull(billingRecords.voidedAt),
        isNull(projects.archivedAt),
        isNotNull(billingRecords.projectId),
        sql`${billingRecords.retentionHeldRemaining}::numeric > 0`,
      ),
    )
    .groupBy(billingRecords.projectId, projects.name, billingRecords.currency)
    .orderBy(sql`sum(${billingRecords.retentionHeldRemaining}::numeric) desc`)
    .limit(limit);

  return rows
    .filter((row): row is typeof row & { projectId: string } => Boolean(row.projectId))
    .map((row) => ({
      projectId: row.projectId,
      projectName: row.projectName,
      heldRemaining: row.heldRemaining,
      currency: row.currency,
      recordCount: Number(row.recordCount),
    }));
}
