import { DomainRuleError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate, type BusinessDate } from '@/shared/dates';
import { toNumericString, type MoneyValue } from '@/shared/money';
import { allocateByProjectWeights } from '../domain/allocation';
import {
  applyActiveDayExposureToBases,
  assertValidAllocationPeriod,
  selectEligibleProjectsForMethod,
  type AllocationPeriod,
} from '../domain/allocation-eligibility';
import {
  classifyExpenseCost,
  isAllocatableClassification,
  requireWeightMethod,
  resolveAllocationMethodPolicy,
  resolveMethodSource,
} from '../domain/allocation-policy';
import {
  aggregateSliceAllocationLines,
  assertSlicesSumToSource,
  buildAllocationSlices,
  planSlicesWithFrozenHistory,
  resolveAllocationScheduleMode,
  scheduleModeFromCategoryPeriodBehavior,
  type AllocationSlice,
  type FrozenSliceAllocation,
} from '../domain/allocation-schedule';
import type {
  AllocationMethod,
  AllocationScheduleMode,
  CostFamily,
  ResolvedAllocationLine,
  WeightAllocationMethod,
} from '../domain/types';
import { isWeightAllocationMethod } from '../domain/types';
import {
  listProjectsForAllocationEligibility,
  loadOrganizationDefaultAllocationMethod,
  resolveWeightBasesForMethod,
} from '../data/allocation-bases.repository';
import {
  findLatestDraftOrAppliedRunId,
  insertAllocationRun,
  listAppliedFrozenSlices,
  supersedeOpenRunsForExpense,
  supersedeRunsForSlices,
} from '../data/allocation-runs.repository';
import {
  findCostCategoryById,
  replaceExpenseAllocations,
  type AllocationInsertRow,
} from '../data/expenses.repository';

export interface RunAutomaticAllocationInput {
  readonly expenseId: string;
  readonly costFamily: CostFamily;
  readonly projectId: string | null;
  readonly costCategoryId: string | null;
  readonly netAmount: MoneyValue;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
  readonly explicitMethod?: AllocationMethod | null;
  /** When SHARED, operator may restrict to selected projects. */
  readonly eligibleProjectIds?: readonly string[] | null;
  readonly runStatus?: 'draft' | 'applied';
  /**
   * How to slice source NET across periods. Defaults to one_time (Wave 2 behaviour).
   * `annual` / `monthly` / `custom` distribute evenly across overlapping calendar months.
   */
  readonly scheduleMode?: AllocationScheduleMode | null;
  /**
   * When true (default for applied re-runs), keep existing applied slice snapshots
   * and only compute pending slices. Draft recompute supersedes drafts only.
   */
  readonly preserveAppliedSlices?: boolean;
}

export interface AutomaticAllocationResult {
  readonly method: WeightAllocationMethod;
  readonly lines: ResolvedAllocationLine[];
  readonly runId: string;
  readonly runIds: readonly string[];
  readonly slices: readonly AllocationSlice[];
  readonly frozenSliceCount: number;
}

function mapLinesToInsert(lines: readonly ResolvedAllocationLine[]): AllocationInsertRow[] {
  return lines.map((line) => ({
    targetType: line.targetType,
    projectId: line.projectId,
    workPackageId: line.workPackageId,
    costCategoryId: line.costCategoryId,
    method: line.method,
    amount: toNumericString(line.amount),
    currency: line.amount.currency,
    percent: line.percent,
    notes: line.notes,
    sortOrder: line.sortOrder,
    amountBasis: line.amountBasis,
  }));
}

async function allocateOneSlice(
  context: OrgContext,
  input: {
    readonly expenseId: string;
    readonly costCategoryId: string | null;
    readonly weightMethod: WeightAllocationMethod;
    readonly classification: ReturnType<typeof classifyExpenseCost>;
    readonly methodSource: ReturnType<typeof resolveMethodSource>;
    readonly scheduleMode: AllocationScheduleMode;
    readonly sourcePeriodStart: BusinessDate;
    readonly sourcePeriodEnd: BusinessDate;
    readonly sourceNet: MoneyValue;
    readonly slice: AllocationSlice;
    readonly allProjects: Awaited<ReturnType<typeof listProjectsForAllocationEligibility>>;
    readonly eligibleProjectIds?: readonly string[] | null;
    readonly runStatus: 'draft' | 'applied';
  },
): Promise<{
  readonly runId: string;
  readonly lines: ResolvedAllocationLine[];
  readonly frozen: FrozenSliceAllocation;
}> {
  const period: AllocationPeriod = {
    start: input.slice.periodStart,
    end: input.slice.periodEnd,
  };

  const eligible = selectEligibleProjectsForMethod(
    input.allProjects,
    period,
    input.weightMethod,
    input.eligibleProjectIds,
  );

  if (eligible.length === 0) {
    throw new DomainRuleError(
      `No eligible projects in allocation slice ${input.slice.sliceIndex} (${period.start}–${period.end})`,
      'expenses.errors.allocationNoEligibleProjects',
    );
  }

  const rawBases = await resolveWeightBasesForMethod(
    context.db,
    context.organizationId,
    input.weightMethod,
    period,
    eligible.map((p) => p.id),
    input.sourceNet.currency,
  );

  // Partial-month exposure: contract/equal multiply by active days in slice;
  // labor hours / direct cost already scoped to the slice (inherent).
  const bases = applyActiveDayExposureToBases({
    method: input.weightMethod,
    slice: period,
    projects: eligible,
    bases: rawBases,
  });

  if (bases.length === 0) {
    throw new DomainRuleError(
      `No projects with active days in allocation slice ${input.slice.sliceIndex} (${period.start}–${period.end})`,
      'expenses.errors.allocationNoEligibleProjects',
    );
  }

  const { lines, explanation } = allocateByProjectWeights({
    allocatableNet: input.slice.amount,
    method: input.weightMethod,
    periodStart: period.start,
    periodEnd: period.end,
    bases,
    costCategoryId: input.costCategoryId,
    sourceExpenseId: input.expenseId,
  });

  const runId = await insertAllocationRun(context.db, context.organizationId, {
    expenseId: input.expenseId,
    method: input.weightMethod,
    status: input.runStatus,
    periodStart: period.start,
    periodEnd: period.end,
    sourceNetAmount: toNumericString(input.sourceNet),
    allocatableNetAmount: toNumericString(input.slice.amount),
    currency: input.sourceNet.currency,
    amountBasis: 'net',
    scheduleMode: input.scheduleMode,
    sliceIndex: input.slice.sliceIndex,
    sourcePeriodStart: input.sourcePeriodStart,
    sourcePeriodEnd: input.sourcePeriodEnd,
    explanation: {
      ...explanation,
      classification: input.classification,
      methodSource: input.methodSource,
      scheduleMode: input.scheduleMode,
      sliceIndex: input.slice.sliceIndex,
      sourcePeriodStart: input.sourcePeriodStart,
      sourcePeriodEnd: input.sourcePeriodEnd,
      sourceNetAmount: input.sourceNet.amount,
      frozen: false,
      allocatableNet: {
        amount: explanation.allocatableNet.amount,
        currency: explanation.allocatableNet.currency,
      },
    },
    createdByUserId: context.userId,
    lines: explanation.lines.map((line, index) => ({
      projectId: line.projectId,
      basisValue: line.basisValue,
      basisUnit: explanation.basisUnit,
      weightPercent: line.percent,
      amount: line.amount,
      currency: input.sourceNet.currency,
      explanation: {
        projectId: line.projectId,
        basisValue: line.basisValue,
        percent: line.percent,
        amount: line.amount,
        method: input.weightMethod,
        periodStart: period.start,
        periodEnd: period.end,
        sliceIndex: input.slice.sliceIndex,
        scheduleMode: input.scheduleMode,
        sourceNet: input.sourceNet.amount,
        sliceNet: input.slice.amount.amount,
      },
      sortOrder: index,
    })),
  });

  return {
    runId,
    lines,
    frozen: {
      sliceIndex: input.slice.sliceIndex,
      periodStart: period.start,
      periodEnd: period.end,
      amount: input.slice.amount,
      lines,
      method: input.weightMethod,
      totalBasis: explanation.totalBasis,
      basisUnit: explanation.basisUnit,
      eligibleProjectIds: explanation.eligibleProjectIds,
    },
  };
}

/**
 * Computes weight-based allocation, persists expense_allocations (net basis),
 * and writes allocation_runs snapshot(s).
 *
 * Periodic modes (`monthly` / `annual` / `custom`) split source NET into
 * calendar-month slices; each slice allocates among projects eligible in that
 * window using the selected driver. Applied slices stay frozen on re-run.
 */
export async function runAutomaticAllocation(
  context: OrgContext,
  input: RunAutomaticAllocationInput,
): Promise<AutomaticAllocationResult> {
  const classification = classifyExpenseCost(input.costFamily, Boolean(input.projectId));
  if (!isAllocatableClassification(classification)) {
    throw new DomainRuleError(
      'Direct project expenses cannot use automatic allocation',
      'expenses.errors.directCannotAutoAllocate',
    );
  }

  const sourcePeriod: AllocationPeriod = {
    start: businessDate(input.periodStart),
    end: businessDate(input.periodEnd),
  };
  try {
    assertValidAllocationPeriod(sourcePeriod);
  } catch {
    throw new DomainRuleError(
      'Allocation period start must be on or before end',
      'expenses.errors.allocationPeriodInvalid',
    );
  }

  let categoryDefault: AllocationMethod | null = null;
  let categoryPeriodBehavior: Parameters<typeof scheduleModeFromCategoryPeriodBehavior>[0] = null;
  if (input.costCategoryId) {
    const category = await findCostCategoryById(
      context.db,
      context.organizationId,
      input.costCategoryId,
    );
    categoryDefault = category?.defaultAllocationMethod ?? null;
    categoryPeriodBehavior = category?.defaultPeriodBehavior ?? null;
  }

  const orgDefault = await loadOrganizationDefaultAllocationMethod(
    context.db,
    context.organizationId,
  );

  const method = resolveAllocationMethodPolicy({
    explicitMethod: input.explicitMethod,
    categoryDefaultMethod: categoryDefault,
    organizationDefaultMethod: orgDefault,
  });

  if (!method || !isWeightAllocationMethod(method)) {
    throw new DomainRuleError(
      'Automatic allocation requires a weight method (contract, labor hours, direct cost, or equal_split)',
      'expenses.errors.allocationDriverRequired',
    );
  }

  const source = resolveMethodSource({
    explicitMethod: input.explicitMethod,
    categoryDefaultMethod: categoryDefault,
    organizationDefaultMethod: orgDefault,
  });
  if (method === 'equal_split' && !source) {
    throw new DomainRuleError(
      'equal_split allocation requires an explicit method selection',
      'expenses.errors.equalSplitRequiresExplicit',
    );
  }

  const weightMethod = requireWeightMethod(method);
  const scheduleMode = resolveAllocationScheduleMode(
    input.scheduleMode ?? scheduleModeFromCategoryPeriodBehavior(categoryPeriodBehavior),
  );
  const runStatus = input.runStatus ?? 'draft';
  const preserveApplied =
    input.preserveAppliedSlices ?? (runStatus === 'applied' || scheduleMode !== 'one_time');

  const slices = buildAllocationSlices({
    sourceNet: input.netAmount,
    scheduleMode,
    periodStart: sourcePeriod.start,
    periodEnd: sourcePeriod.end,
  });
  assertSlicesSumToSource(input.netAmount, slices);

  const frozenExisting = preserveApplied
    ? await listAppliedFrozenSlices(context.db, context.organizationId, input.expenseId)
    : [];

  const { reusable, pending } = planSlicesWithFrozenHistory({
    slices,
    frozen: frozenExisting,
  });

  if (preserveApplied) {
    await supersedeRunsForSlices(
      context.db,
      context.organizationId,
      input.expenseId,
      pending.map((slice) => slice.sliceIndex),
    );
    // Also clear drafts that are not in the pending set (schedule shrink / mode change).
    await supersedeOpenRunsForExpense(context.db, context.organizationId, input.expenseId, {
      preserveApplied: true,
    });
  } else {
    await supersedeOpenRunsForExpense(context.db, context.organizationId, input.expenseId);
  }

  const allProjects = await listProjectsForAllocationEligibility(context.db, context.organizationId);
  const runIds: string[] = [];
  const completedFrozen: FrozenSliceAllocation[] = [...reusable];

  for (const slice of pending) {
    const result = await allocateOneSlice(context, {
      expenseId: input.expenseId,
      costCategoryId: input.costCategoryId,
      weightMethod,
      classification,
      methodSource: source,
      scheduleMode,
      sourcePeriodStart: sourcePeriod.start,
      sourcePeriodEnd: sourcePeriod.end,
      sourceNet: input.netAmount,
      slice,
      allProjects,
      eligibleProjectIds: input.eligibleProjectIds,
      runStatus,
    });
    runIds.push(result.runId);
    completedFrozen.push(result.frozen);
  }

  completedFrozen.sort((a, b) => a.sliceIndex - b.sliceIndex);
  const orderedLines = completedFrozen.map((row) => row.lines);

  const lines = aggregateSliceAllocationLines({
    sourceNet: input.netAmount,
    sliceLines: orderedLines,
    method: weightMethod,
    costCategoryId: input.costCategoryId,
  });

  await replaceExpenseAllocations(
    context.db,
    context.organizationId,
    input.expenseId,
    mapLinesToInsert(lines),
  );

  const runId =
    runIds[runIds.length - 1] ??
    (await findLatestDraftOrAppliedRunId(context.db, context.organizationId, input.expenseId)) ??
    '';

  return {
    method: weightMethod,
    lines,
    runId,
    runIds,
    slices,
    frozenSliceCount: reusable.length,
  };
}
