import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  projectBillingCycleLines,
  projectBillingCycleRevisions,
  projectBillingCycles,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  BillingCycleDocumentKind,
  BillingCycleStatus,
  ProjectBillingCycleLineRecord,
  ProjectBillingCycleRecord,
} from '../domain/types';

function mapCycle(row: typeof projectBillingCycles.$inferSelect): ProjectBillingCycleRecord {
  const submittedAt = row.submittedAt ?? null;
  const submittedByUserId = row.submittedByUserId ?? null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    planId: row.planId,
    projectId: row.projectId,
    contractId: row.contractId,
    cycleNumber: row.cycleNumber,
    title: row.title,
    documentKind: row.documentKind as BillingCycleDocumentKind,
    status: row.status as BillingCycleStatus,
    periodStart: row.periodStart ?? null,
    periodEnd: row.periodEnd ?? null,
    accountDate: row.accountDate,
    retentionPercent: row.retentionPercent ?? null,
    notes: row.notes ?? null,
    billingRecordId: row.billingRecordId ?? null,
    issuedAt: submittedAt,
    issuedByUserId: submittedByUserId,
    submittedAt,
    submittedByUserId,
    revisionNumber: row.revisionNumber ?? 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCycleLine(
  row: typeof projectBillingCycleLines.$inferSelect,
): ProjectBillingCycleLineRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    cycleId: row.cycleId,
    planLineId: row.planLineId,
    sortOrder: row.sortOrder,
    currentPercent: row.currentPercent ?? null,
    currentAmount: row.currentAmount ?? null,
    requestedPercent: row.requestedPercent ?? null,
    requestedAmount: row.requestedAmount ?? null,
    approvedPercent: row.approvedPercent ?? null,
    approvedAmount: row.approvedAmount ?? null,
    priorPercent: row.priorPercent,
    priorAmount: row.priorAmount,
    cumulativePercent: row.cumulativePercent,
    cumulativeAmount: row.cumulativeAmount,
    remainingAmount: row.remainingAmount,
    baseAmountSnapshot: row.baseAmountSnapshot,
    retentionAmount: row.retentionAmount,
    lineNotes: row.lineNotes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findCycleById(
  db: DbExecutor,
  organizationId: string,
  cycleId: string,
): Promise<ProjectBillingCycleRecord | null> {
  const [row] = await db
    .select()
    .from(projectBillingCycles)
    .where(
      and(
        eq(projectBillingCycles.organizationId, organizationId),
        eq(projectBillingCycles.id, cycleId),
      ),
    )
    .limit(1);
  return row ? mapCycle(row) : null;
}

export async function listCyclesForPlan(
  db: DbExecutor,
  organizationId: string,
  planId: string,
): Promise<ProjectBillingCycleRecord[]> {
  const rows = await db
    .select()
    .from(projectBillingCycles)
    .where(
      and(
        eq(projectBillingCycles.organizationId, organizationId),
        eq(projectBillingCycles.planId, planId),
      ),
    )
    .orderBy(asc(projectBillingCycles.cycleNumber));
  return rows.map(mapCycle);
}

export async function nextCycleNumber(
  db: DbExecutor,
  organizationId: string,
  planId: string,
): Promise<number> {
  const [row] = await db
    .select({ cycleNumber: projectBillingCycles.cycleNumber })
    .from(projectBillingCycles)
    .where(
      and(
        eq(projectBillingCycles.organizationId, organizationId),
        eq(projectBillingCycles.planId, planId),
      ),
    )
    .orderBy(desc(projectBillingCycles.cycleNumber))
    .limit(1);
  return (row?.cycleNumber ?? 0) + 1;
}

export async function insertCycle(
  db: DbExecutor,
  row: {
    organizationId: string;
    planId: string;
    projectId: string;
    contractId: string;
    cycleNumber: number;
    title: string;
    documentKind: BillingCycleDocumentKind;
    status?: BillingCycleStatus;
    periodStart?: string | null;
    periodEnd?: string | null;
    accountDate: string;
    retentionPercent?: string | null;
    notes?: string | null;
  },
): Promise<ProjectBillingCycleRecord> {
  const [inserted] = await db
    .insert(projectBillingCycles)
    .values({
      organizationId: row.organizationId,
      planId: row.planId,
      projectId: row.projectId,
      contractId: row.contractId,
      cycleNumber: row.cycleNumber,
      title: row.title,
      documentKind: row.documentKind,
      status: row.status ?? 'draft',
      periodStart: row.periodStart ?? null,
      periodEnd: row.periodEnd ?? null,
      accountDate: row.accountDate,
      retentionPercent: row.retentionPercent ?? null,
      notes: row.notes ?? null,
    })
    .returning();
  return mapCycle(inserted!);
}

export async function updateCycle(
  db: DbExecutor,
  organizationId: string,
  cycleId: string,
  patch: Partial<{
    title: string;
    status: BillingCycleStatus;
    periodStart: string | null;
    periodEnd: string | null;
    accountDate: string;
    retentionPercent: string | null;
    notes: string | null;
    billingRecordId: string | null;
    submittedAt: Date | null;
    submittedByUserId: string | null;
    revisionNumber: number;
    /** @deprecated */
    issuedAt: Date | null;
    /** @deprecated */
    issuedByUserId: string | null;
  }>,
): Promise<ProjectBillingCycleRecord | null> {
  const setPayload: Record<string, unknown> = {
    updatedAt: sql`now()`,
  };
  if (patch.title !== undefined) setPayload.title = patch.title;
  if (patch.status !== undefined) setPayload.status = patch.status;
  if (patch.periodStart !== undefined) setPayload.periodStart = patch.periodStart;
  if (patch.periodEnd !== undefined) setPayload.periodEnd = patch.periodEnd;
  if (patch.accountDate !== undefined) setPayload.accountDate = patch.accountDate;
  if (patch.retentionPercent !== undefined) setPayload.retentionPercent = patch.retentionPercent;
  if (patch.notes !== undefined) setPayload.notes = patch.notes;
  if (patch.billingRecordId !== undefined) setPayload.billingRecordId = patch.billingRecordId;
  if (patch.revisionNumber !== undefined) setPayload.revisionNumber = patch.revisionNumber;

  const submittedAt = patch.submittedAt ?? patch.issuedAt;
  const submittedByUserId = patch.submittedByUserId ?? patch.issuedByUserId;
  if (submittedAt !== undefined) setPayload.submittedAt = submittedAt;
  if (submittedByUserId !== undefined) setPayload.submittedByUserId = submittedByUserId;

  const [updated] = await db
    .update(projectBillingCycles)
    .set(setPayload)
    .where(
      and(
        eq(projectBillingCycles.organizationId, organizationId),
        eq(projectBillingCycles.id, cycleId),
      ),
    )
    .returning();
  return updated ? mapCycle(updated) : null;
}

export async function listCycleLines(
  db: DbExecutor,
  organizationId: string,
  cycleId: string,
): Promise<ProjectBillingCycleLineRecord[]> {
  const rows = await db
    .select()
    .from(projectBillingCycleLines)
    .where(
      and(
        eq(projectBillingCycleLines.organizationId, organizationId),
        eq(projectBillingCycleLines.cycleId, cycleId),
      ),
    )
    .orderBy(asc(projectBillingCycleLines.sortOrder), asc(projectBillingCycleLines.createdAt));
  return rows.map(mapCycleLine);
}

export async function findCycleLine(
  db: DbExecutor,
  organizationId: string,
  cycleId: string,
  planLineId: string,
): Promise<ProjectBillingCycleLineRecord | null> {
  const [row] = await db
    .select()
    .from(projectBillingCycleLines)
    .where(
      and(
        eq(projectBillingCycleLines.organizationId, organizationId),
        eq(projectBillingCycleLines.cycleId, cycleId),
        eq(projectBillingCycleLines.planLineId, planLineId),
      ),
    )
    .limit(1);
  return row ? mapCycleLine(row) : null;
}

export async function upsertCycleLine(
  db: DbExecutor,
  row: {
    organizationId: string;
    cycleId: string;
    planLineId: string;
    sortOrder: number;
    currentPercent: string | null;
    currentAmount: string | null;
    requestedPercent?: string | null;
    requestedAmount?: string | null;
    approvedPercent?: string | null;
    approvedAmount?: string | null;
    priorPercent: string;
    priorAmount: string;
    cumulativePercent: string;
    cumulativeAmount: string;
    remainingAmount: string;
    baseAmountSnapshot: string;
    retentionAmount: string;
    lineNotes?: string | null;
  },
): Promise<ProjectBillingCycleLineRecord> {
  const existing = await findCycleLine(db, row.organizationId, row.cycleId, row.planLineId);
  const linePatch = {
    sortOrder: row.sortOrder,
    currentPercent: row.currentPercent,
    currentAmount: row.currentAmount,
    requestedPercent: row.requestedPercent ?? null,
    requestedAmount: row.requestedAmount ?? null,
    approvedPercent: row.approvedPercent ?? null,
    approvedAmount: row.approvedAmount ?? null,
    priorPercent: row.priorPercent,
    priorAmount: row.priorAmount,
    cumulativePercent: row.cumulativePercent,
    cumulativeAmount: row.cumulativeAmount,
    remainingAmount: row.remainingAmount,
    baseAmountSnapshot: row.baseAmountSnapshot,
    retentionAmount: row.retentionAmount,
    lineNotes: row.lineNotes ?? null,
    updatedAt: sql`now()`,
  };
  if (existing) {
    const [updated] = await db
      .update(projectBillingCycleLines)
      .set(linePatch)
      .where(
        and(
          eq(projectBillingCycleLines.organizationId, row.organizationId),
          eq(projectBillingCycleLines.id, existing.id),
        ),
      )
      .returning();
    return mapCycleLine(updated!);
  }

  const [inserted] = await db
    .insert(projectBillingCycleLines)
    .values({
      organizationId: row.organizationId,
      cycleId: row.cycleId,
      planLineId: row.planLineId,
      sortOrder: row.sortOrder,
      currentPercent: row.currentPercent,
      currentAmount: row.currentAmount,
      requestedPercent: row.requestedPercent ?? null,
      requestedAmount: row.requestedAmount ?? null,
      approvedPercent: row.approvedPercent ?? null,
      approvedAmount: row.approvedAmount ?? null,
      priorPercent: row.priorPercent,
      priorAmount: row.priorAmount,
      cumulativePercent: row.cumulativePercent,
      cumulativeAmount: row.cumulativeAmount,
      remainingAmount: row.remainingAmount,
      baseAmountSnapshot: row.baseAmountSnapshot,
      retentionAmount: row.retentionAmount,
      lineNotes: row.lineNotes ?? null,
    })
    .returning();
  return mapCycleLine(inserted!);
}

export async function insertCycleLines(
  db: DbExecutor,
  rows: readonly Parameters<typeof upsertCycleLine>[1][],
): Promise<ProjectBillingCycleLineRecord[]> {
  const result: ProjectBillingCycleLineRecord[] = [];
  for (const row of rows) {
    result.push(await upsertCycleLine(db, row));
  }
  return result;
}

const BILLABLE_CYCLE_STATUSES: ReadonlySet<BillingCycleStatus> = new Set([
  'submitted',
  'partially_approved',
  'approved',
]);

/**
 * Prior billed for next cycle = sum of APPROVED cumulatives only.
 * Submitted-but-unapproved amounts do not consume plan remaining.
 */
export async function sumApprovedAmountsByPlanLine(
  db: DbExecutor,
  organizationId: string,
  planId: string,
): Promise<Map<string, { amount: string; percent: string }>> {
  const rows = await db
    .select({
      planLineId: projectBillingCycleLines.planLineId,
      cumulativeAmount: projectBillingCycleLines.cumulativeAmount,
      cumulativePercent: projectBillingCycleLines.cumulativePercent,
      cycleNumber: projectBillingCycles.cycleNumber,
    })
    .from(projectBillingCycleLines)
    .innerJoin(
      projectBillingCycles,
      and(
        eq(projectBillingCycleLines.cycleId, projectBillingCycles.id),
        eq(projectBillingCycleLines.organizationId, projectBillingCycles.organizationId),
      ),
    )
    .where(
      and(
        eq(projectBillingCycles.organizationId, organizationId),
        eq(projectBillingCycles.planId, planId),
        inArray(projectBillingCycles.status, ['submitted', 'partially_approved', 'approved']),
        sql`${projectBillingCycleLines.approvedAmount} IS NOT NULL`,
      ),
    )
    .orderBy(asc(projectBillingCycles.cycleNumber));

  const totals = new Map<string, { amount: string; percent: string }>();
  for (const row of rows) {
    // Latest approved cumulative wins (cycles ordered by number).
    totals.set(row.planLineId, {
      amount: row.cumulativeAmount,
      percent: row.cumulativePercent,
    });
  }
  return totals;
}

/** @deprecated Prefer sumApprovedAmountsByPlanLine. */
export const sumIssuedAmountsByPlanLine = sumApprovedAmountsByPlanLine;

export async function listIssuedRetentionAmounts(
  db: DbExecutor,
  organizationId: string,
  planId: string,
): Promise<string[]> {
  const cycles = await listCyclesForPlan(db, organizationId, planId);
  const billableIds = cycles.filter((c) => BILLABLE_CYCLE_STATUSES.has(c.status)).map((c) => c.id);
  if (billableIds.length === 0) return [];

  const rows = await db
    .select({ retentionAmount: projectBillingCycleLines.retentionAmount })
    .from(projectBillingCycleLines)
    .where(
      and(
        eq(projectBillingCycleLines.organizationId, organizationId),
        inArray(projectBillingCycleLines.cycleId, billableIds),
        sql`${projectBillingCycleLines.approvedAmount} IS NOT NULL`,
      ),
    );

  return rows.map((row) => row.retentionAmount);
}

/** Removes draft-only cycles (and revisions) before deleting an unused plan. */
export async function deleteAllCyclesForPlan(
  db: DbExecutor,
  organizationId: string,
  planId: string,
): Promise<void> {
  const cycles = await listCyclesForPlan(db, organizationId, planId);
  if (cycles.length === 0) return;

  const cycleIds = cycles.map((cycle) => cycle.id);
  await db
    .delete(projectBillingCycleRevisions)
    .where(
      and(
        eq(projectBillingCycleRevisions.organizationId, organizationId),
        inArray(projectBillingCycleRevisions.cycleId, cycleIds),
      ),
    );
  await db
    .delete(projectBillingCycles)
    .where(
      and(
        eq(projectBillingCycles.organizationId, organizationId),
        eq(projectBillingCycles.planId, planId),
      ),
    );
}
