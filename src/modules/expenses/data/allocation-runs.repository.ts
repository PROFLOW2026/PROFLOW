import { and, eq, inArray } from 'drizzle-orm';
import { allocationRunLines, allocationRuns } from '@drizzle/schema';
import { fromNumericString } from '@/shared/money';
import type { DbExecutor } from '@/shared/db/types';
import type {
  AllocationMethod,
  AllocationRunExplanation,
  AllocationScheduleMode,
  ResolvedAllocationLine,
  WeightAllocationMethod,
} from '../domain/types';
import type { FrozenSliceAllocation } from '../domain/allocation-schedule';
import { isWeightAllocationMethod } from '../domain/types';

export interface AllocationRunInsert {
  readonly expenseId: string;
  readonly method: AllocationMethod;
  readonly status: 'draft' | 'applied' | 'superseded';
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly sourceNetAmount: string;
  readonly allocatableNetAmount: string;
  readonly currency: string;
  readonly amountBasis: 'gross' | 'net';
  readonly explanation: AllocationRunExplanation | Record<string, unknown>;
  readonly createdByUserId: string | null;
  readonly scheduleMode?: AllocationScheduleMode | null;
  readonly sliceIndex?: number | null;
  readonly sourcePeriodStart?: string | null;
  readonly sourcePeriodEnd?: string | null;
  readonly lines: readonly {
    readonly projectId: string;
    readonly basisValue: string;
    readonly basisUnit: string;
    readonly weightPercent: string;
    readonly amount: string;
    readonly currency: string;
    readonly explanation: Record<string, unknown> | null;
    readonly sortOrder: number;
  }[];
}

export async function supersedeOpenRunsForExpense(
  db: DbExecutor,
  organizationId: string,
  expenseId: string,
  options?: { readonly preserveApplied?: boolean },
): Promise<void> {
  const statuses: Array<'draft' | 'applied'> = options?.preserveApplied
    ? ['draft']
    : ['draft', 'applied'];

  for (const status of statuses) {
    await db
      .update(allocationRuns)
      .set({ status: 'superseded' })
      .where(
        and(
          eq(allocationRuns.organizationId, organizationId),
          eq(allocationRuns.expenseId, expenseId),
          eq(allocationRuns.status, status),
        ),
      );
  }
}

/** Supersede draft/applied runs whose slice_index is in the given set (recompute only pending). */
export async function supersedeRunsForSlices(
  db: DbExecutor,
  organizationId: string,
  expenseId: string,
  sliceIndexes: readonly number[],
): Promise<void> {
  if (sliceIndexes.length === 0) return;
  await db
    .update(allocationRuns)
    .set({ status: 'superseded' })
    .where(
      and(
        eq(allocationRuns.organizationId, organizationId),
        eq(allocationRuns.expenseId, expenseId),
        eq(allocationRuns.status, 'draft'),
        inArray(allocationRuns.sliceIndex, [...sliceIndexes]),
      ),
    );
}

export async function insertAllocationRun(
  db: DbExecutor,
  organizationId: string,
  input: AllocationRunInsert,
): Promise<string> {
  // Insert as draft first so line inserts pass the immutability guard;
  // then promote to applied when requested (0018 allocation_run_lines_guard).
  // Callers should run inside an open transaction for atomicity.
  const [run] = await db
    .insert(allocationRuns)
    .values({
      organizationId,
      expenseId: input.expenseId,
      method: input.method,
      status: 'draft',
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      sourceNetAmount: input.sourceNetAmount,
      allocatableNetAmount: input.allocatableNetAmount,
      currency: input.currency,
      amountBasis: input.amountBasis,
      explanation: input.explanation as Record<string, unknown>,
      createdByUserId: input.createdByUserId,
      scheduleMode: input.scheduleMode ?? null,
      sliceIndex: input.sliceIndex ?? null,
      sourcePeriodStart: input.sourcePeriodStart ?? null,
      sourcePeriodEnd: input.sourcePeriodEnd ?? null,
    })
    .returning({ id: allocationRuns.id });

  const runId = run!.id;
  if (input.lines.length > 0) {
    await db.insert(allocationRunLines).values(
      input.lines.map((line) => ({
        organizationId,
        runId,
        projectId: line.projectId,
        basisValue: line.basisValue,
        basisUnit: line.basisUnit,
        weightPercent: line.weightPercent,
        amount: line.amount,
        currency: line.currency,
        explanation: line.explanation,
        sortOrder: line.sortOrder,
      })),
    );
  }
  if (input.status === 'applied') {
    await markAllocationRunApplied(db, organizationId, runId);
  }
  return runId;
}

export async function markAllocationRunApplied(
  db: DbExecutor,
  organizationId: string,
  runId: string,
): Promise<void> {
  await db
    .update(allocationRuns)
    .set({ status: 'applied' })
    .where(and(eq(allocationRuns.id, runId), eq(allocationRuns.organizationId, organizationId)));
}

export async function markExpenseAllocationRunsApplied(
  db: DbExecutor,
  organizationId: string,
  expenseId: string,
): Promise<void> {
  await db
    .update(allocationRuns)
    .set({ status: 'applied' })
    .where(
      and(
        eq(allocationRuns.organizationId, organizationId),
        eq(allocationRuns.expenseId, expenseId),
        eq(allocationRuns.status, 'draft'),
      ),
    );
}

export async function findLatestDraftOrAppliedRunId(
  db: DbExecutor,
  organizationId: string,
  expenseId: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: allocationRuns.id, status: allocationRuns.status, runAt: allocationRuns.runAt })
    .from(allocationRuns)
    .where(
      and(eq(allocationRuns.organizationId, organizationId), eq(allocationRuns.expenseId, expenseId)),
    );

  const sorted = rows.slice().sort((a, b) => b.runAt.getTime() - a.runAt.getTime());
  const applied = sorted.find((r) => r.status === 'applied');
  if (applied) return applied.id;
  const draft = sorted.find((r) => r.status === 'draft');
  return draft?.id ?? null;
}

/**
 * Loads applied slice snapshots so periodic re-runs can freeze historical months.
 */
export async function listAppliedFrozenSlices(
  db: DbExecutor,
  organizationId: string,
  expenseId: string,
): Promise<FrozenSliceAllocation[]> {
  const runs = await db
    .select({
      id: allocationRuns.id,
      method: allocationRuns.method,
      periodStart: allocationRuns.periodStart,
      periodEnd: allocationRuns.periodEnd,
      allocatableNetAmount: allocationRuns.allocatableNetAmount,
      currency: allocationRuns.currency,
      sliceIndex: allocationRuns.sliceIndex,
      explanation: allocationRuns.explanation,
    })
    .from(allocationRuns)
    .where(
      and(
        eq(allocationRuns.organizationId, organizationId),
        eq(allocationRuns.expenseId, expenseId),
        eq(allocationRuns.status, 'applied'),
      ),
    );

  if (runs.length === 0) return [];

  const runIds = runs.map((run) => run.id);
  const lineRows = await db
    .select({
      runId: allocationRunLines.runId,
      projectId: allocationRunLines.projectId,
      basisValue: allocationRunLines.basisValue,
      basisUnit: allocationRunLines.basisUnit,
      weightPercent: allocationRunLines.weightPercent,
      amount: allocationRunLines.amount,
      currency: allocationRunLines.currency,
      sortOrder: allocationRunLines.sortOrder,
    })
    .from(allocationRunLines)
    .where(
      and(
        eq(allocationRunLines.organizationId, organizationId),
        inArray(allocationRunLines.runId, runIds),
      ),
    );

  const linesByRun = new Map<string, typeof lineRows>();
  for (const line of lineRows) {
    const list = linesByRun.get(line.runId) ?? [];
    list.push(line);
    linesByRun.set(line.runId, list);
  }

  const frozen: FrozenSliceAllocation[] = [];
  for (const run of runs) {
    if (run.sliceIndex === null || run.sliceIndex === undefined) {
      // Legacy single-period applied run — treat as slice 0.
      if (runs.length > 1) continue;
    }
    const sliceIndex = run.sliceIndex ?? 0;
    const method = run.method;
    if (!isWeightAllocationMethod(method)) continue;

    const explanation = (run.explanation ?? {}) as Partial<AllocationRunExplanation>;
    const sortedLines = (linesByRun.get(run.id) ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.projectId.localeCompare(b.projectId));

    const lines: ResolvedAllocationLine[] = sortedLines.map((line, index) => ({
      targetType: 'project' as const,
      projectId: line.projectId,
      workPackageId: null,
      costCategoryId: null,
      method,
      amount: fromNumericString(line.amount, line.currency)!,
      percent: line.weightPercent,
      notes: null,
      sortOrder: index,
      amountBasis: 'net' as const,
    }));

    frozen.push({
      sliceIndex,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      amount: fromNumericString(run.allocatableNetAmount, run.currency)!,
      lines,
      method: method as WeightAllocationMethod,
      totalBasis: explanation.totalBasis ?? '0',
      basisUnit: explanation.basisUnit ?? 'money',
      eligibleProjectIds: lines.map((line) => line.projectId!).filter(Boolean),
    });
  }

  return frozen.sort((a, b) => a.sliceIndex - b.sliceIndex);
}
