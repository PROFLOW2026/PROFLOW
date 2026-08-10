import { and, asc, eq, inArray } from 'drizzle-orm';
import { laborAllocationRunLines, laborAllocationRuns } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { MonthlyAllocationMethod } from '../domain/monthly-cost-gates';

export type LaborAllocationRunRow = typeof laborAllocationRuns.$inferSelect;
export type LaborAllocationRunLineRow = typeof laborAllocationRunLines.$inferSelect;

export type LaborRunStatus = 'draft' | 'applied' | 'superseded';

export async function findActiveLaborAllocationRun(
  db: DbExecutor,
  organizationId: string,
  employeeMonthCostId: string,
): Promise<LaborAllocationRunRow | null> {
  const [row] = await db
    .select()
    .from(laborAllocationRuns)
    .where(
      and(
        eq(laborAllocationRuns.organizationId, organizationId),
        eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCostId),
        inArray(laborAllocationRuns.status, ['draft', 'applied']),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findLaborAllocationRunById(
  db: DbExecutor,
  organizationId: string,
  runId: string,
): Promise<LaborAllocationRunRow | null> {
  const [row] = await db
    .select()
    .from(laborAllocationRuns)
    .where(
      and(eq(laborAllocationRuns.id, runId), eq(laborAllocationRuns.organizationId, organizationId)),
    )
    .limit(1);
  return row ?? null;
}

export async function listLaborAllocationRunLines(
  db: DbExecutor,
  organizationId: string,
  runId: string,
): Promise<LaborAllocationRunLineRow[]> {
  return db
    .select()
    .from(laborAllocationRunLines)
    .where(
      and(
        eq(laborAllocationRunLines.organizationId, organizationId),
        eq(laborAllocationRunLines.laborAllocationRunId, runId),
      ),
    )
    .orderBy(asc(laborAllocationRunLines.sortOrder));
}

/** Supersede active draft/applied runs for a month so a new draft can be inserted. */
export async function supersedeActiveLaborRunsForMonth(
  db: DbExecutor,
  organizationId: string,
  employeeMonthCostId: string,
): Promise<void> {
  await db
    .update(laborAllocationRuns)
    .set({ status: 'superseded', updatedAt: new Date() })
    .where(
      and(
        eq(laborAllocationRuns.organizationId, organizationId),
        eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCostId),
        inArray(laborAllocationRuns.status, ['draft', 'applied']),
      ),
    );
}

export async function insertDraftLaborAllocationRun(
  db: DbExecutor,
  input: {
    organizationId: string;
    employeeMonthCostId: string;
    method: MonthlyAllocationMethod | 'manual_override';
    currency: string;
    allocatedAmount: string;
    unallocatedAmount: string;
    explanation?: string | null;
    supersedesRunId?: string | null;
    lines: readonly {
      projectId: string;
      amount: string;
      currency: string;
      percent?: string | null;
      basisHours?: string | null;
      basisDays?: string | null;
      sortOrder: number;
      notes?: string | null;
    }[];
  },
): Promise<LaborAllocationRunRow> {
  const [run] = await db
    .insert(laborAllocationRuns)
    .values({
      organizationId: input.organizationId,
      employeeMonthCostId: input.employeeMonthCostId,
      method: input.method,
      status: 'draft',
      currency: input.currency,
      allocatedAmount: input.allocatedAmount,
      unallocatedAmount: input.unallocatedAmount,
      explanation: input.explanation ?? null,
      supersedesRunId: input.supersedesRunId ?? null,
    })
    .returning();

  const runId = run!.id;
  if (input.lines.length > 0) {
    await db.insert(laborAllocationRunLines).values(
      input.lines.map((line) => ({
        organizationId: input.organizationId,
        laborAllocationRunId: runId,
        projectId: line.projectId,
        amount: line.amount,
        currency: line.currency,
        percent: line.percent ?? null,
        basisHours: line.basisHours ?? null,
        basisDays: line.basisDays ?? null,
        sortOrder: line.sortOrder,
        notes: line.notes ?? null,
      })),
    );
  }

  return run!;
}

/**
 * Promote a draft run to applied. SQL trigger flips month recognition_source
 * to monthly_allocated and month status to applied.
 */
export async function applyLaborAllocationRun(
  db: DbExecutor,
  organizationId: string,
  runId: string,
): Promise<LaborAllocationRunRow | null> {
  const [row] = await db
    .update(laborAllocationRuns)
    .set({
      status: 'applied',
      appliedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(laborAllocationRuns.id, runId),
        eq(laborAllocationRuns.organizationId, organizationId),
        eq(laborAllocationRuns.status, 'draft'),
      ),
    )
    .returning();
  return row ?? null;
}

/** Delete a draft run (and cascade lines) so amounts can be rewritten. */
export async function deleteDraftLaborAllocationRun(
  db: DbExecutor,
  organizationId: string,
  runId: string,
): Promise<void> {
  await db
    .delete(laborAllocationRuns)
    .where(
      and(
        eq(laborAllocationRuns.id, runId),
        eq(laborAllocationRuns.organizationId, organizationId),
        eq(laborAllocationRuns.status, 'draft'),
      ),
    );
}
