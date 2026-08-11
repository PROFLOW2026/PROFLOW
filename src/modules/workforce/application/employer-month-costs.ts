import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money } from '@/shared/money';
import { withTransaction } from '@/shared/db';
import type { OrgContext } from '@/shared/auth/context';
import { findEmployeeById } from '../data/employees.repository';
import {
  findEmployeeMonthCostByEmployeeMonth,
  insertEmployeeMonthCostDraft,
  listEmployeeMonthCostsForEmployee,
  updateEmployeeMonthCostDraft,
  type EmployeeMonthCostRow,
} from '../data/employee-month-costs.repository';
import {
  applyLaborAllocationRun,
  deleteDraftLaborAllocationRun,
  findActiveLaborAllocationRun,
  findLaborAllocationRunById,
  insertDraftLaborAllocationRun,
  listLaborAllocationRunLines,
  supersedeActiveLaborRunsForMonth,
  type LaborAllocationRunLineRow,
  type LaborAllocationRunRow,
} from '../data/labor-allocation.repository';
import { findProjectById } from '../data/project-refs.repository';
import {
  deriveKnownEmployerCost,
  resolveMonthlyAllocationAmounts,
} from '../domain/monthly-allocation';
import {
  areEmployeeMonthCostsAvailable,
  previewMonthlyCostStrip,
  type MonthlyAllocationMethod,
} from '../domain/monthly-cost-gates';
import {
  applyMonthlyEmployerCostAllocationSchema,
  loadMonthlyEmployerCostReviewSchema,
  saveMonthlyEmployerCostDraftSchema,
  type ApplyMonthlyEmployerCostAllocationInput,
  type LoadMonthlyEmployerCostReviewInput,
  type SaveMonthlyEmployerCostDraftInput,
} from '../validation/schemas';
import {
  assertCanManageWorkforceCost,
  assertCanReadWorkforceCost,
} from './workforce-cost-authz';

/**
 * Application gates for `employee_month_costs` + labor allocation runs.
 * Persistence repositories land with 0021 apply; asserts are mandatory either way
 * (service-role DB sessions still require app-layer authz).
 */

function assertMonthCostsGate(): void {
  if (!areEmployeeMonthCostsAvailable()) {
    throw new ValidationError(
      [{ path: 'employeeMonthCosts', message: 'Monthly employer costs are not available yet' }],
      'Monthly employer costs are not available yet',
    );
  }
}

export async function assertEmployeeMonthCostReadable(
  context: OrgContext,
  employeeId: string,
): Promise<void> {
  assertCanReadWorkforceCost(context);
  const employee = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!employee) throw new NotFoundError('Employee');
}

export async function assertEmployeeMonthCostWritable(
  context: OrgContext,
  employeeId: string,
): Promise<void> {
  assertCanManageWorkforceCost(context);
  const employee = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!employee) throw new NotFoundError('Employee');
}

export async function assertLaborAllocationReadable(context: OrgContext): Promise<void> {
  assertCanReadWorkforceCost(context);
}

export async function assertLaborAllocationWritable(
  context: OrgContext,
  input: { employeeMonthCostId?: string | null } = {},
): Promise<void> {
  assertCanManageWorkforceCost(context);
  if (input.employeeMonthCostId !== undefined && input.employeeMonthCostId !== null) {
    const id = input.employeeMonthCostId.trim();
    if (!id) {
      throw new ValidationError([{ path: 'employeeMonthCostId', message: 'Required' }]);
    }
  }
}

export interface MonthlyEmployerCostReview {
  readonly available: boolean;
  readonly employeeId: string;
  readonly yearMonth: string | null;
  readonly month: EmployeeMonthCostRow | null;
  readonly run: LaborAllocationRunRow | null;
  readonly lines: readonly LaborAllocationRunLineRow[];
  readonly preview: ReturnType<typeof previewMonthlyCostStrip> | null;
  readonly months: readonly EmployeeMonthCostRow[];
}

export async function loadMonthlyEmployerCostReview(
  context: OrgContext,
  rawInput: LoadMonthlyEmployerCostReviewInput,
): Promise<MonthlyEmployerCostReview> {
  const parsed = loadMonthlyEmployerCostReviewSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  await assertEmployeeMonthCostReadable(context, parsed.data.employeeId);

  if (!areEmployeeMonthCostsAvailable()) {
    return {
      available: false,
      employeeId: parsed.data.employeeId,
      yearMonth: parsed.data.yearMonth ?? null,
      month: null,
      run: null,
      lines: [],
      preview: null,
      months: [],
    };
  }

  const months = await listEmployeeMonthCostsForEmployee(
    context.db,
    context.organizationId,
    parsed.data.employeeId,
  );

  const yearMonth = parsed.data.yearMonth ?? months[0]?.yearMonth ?? null;
  if (!yearMonth) {
    return {
      available: true,
      employeeId: parsed.data.employeeId,
      yearMonth: null,
      month: null,
      run: null,
      lines: [],
      preview: null,
      months,
    };
  }

  const month =
    months.find((row) => row.yearMonth === yearMonth) ??
    (await findEmployeeMonthCostByEmployeeMonth(
      context.db,
      context.organizationId,
      parsed.data.employeeId,
      yearMonth,
    ));

  if (!month) {
    return {
      available: true,
      employeeId: parsed.data.employeeId,
      yearMonth,
      month: null,
      run: null,
      lines: [],
      preview: null,
      months,
    };
  }

  const run = await findActiveLaborAllocationRun(
    context.db,
    context.organizationId,
    month.id,
  );
  const lines = run
    ? await listLaborAllocationRunLines(context.db, context.organizationId, run.id)
    : [];

  const preview = previewMonthlyCostStrip({
    estimatedAmount: month.estimatedAmount ?? '',
    actualAmount: month.actualAmount ?? '',
    allocatedAmount: run?.allocatedAmount ?? '0',
  });

  return {
    available: true,
    employeeId: parsed.data.employeeId,
    yearMonth,
    month,
    run,
    lines,
    preview,
    months,
  };
}

export async function saveMonthlyEmployerCostDraft(
  context: OrgContext,
  rawInput: SaveMonthlyEmployerCostDraftInput,
): Promise<{
  readonly month: EmployeeMonthCostRow;
  readonly run: LaborAllocationRunRow | null;
}> {
  assertMonthCostsGate();

  const parsed = saveMonthlyEmployerCostDraftSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  await assertEmployeeMonthCostWritable(context, parsed.data.employeeId);

  const currency = context.organization.baseCurrency.toUpperCase();
  const derived = deriveKnownEmployerCost({
    estimatedAmount: emptyToNull(parsed.data.estimatedAmount),
    actualAmount: emptyToNull(parsed.data.actualAmount),
    currency,
  });

  const allocationLines = parsed.data.allocationLines ?? [];
  const method: MonthlyAllocationMethod = parsed.data.method ?? 'fixed_amount';

  if (allocationLines.length > 0) {
    for (const line of allocationLines) {
      const project = await findProjectById(context.db, context.organizationId, line.projectId);
      if (!project) throw new NotFoundError('Project');
    }
  }

  return withTransaction(context.db, async (tx) => {
    const existing = await findEmployeeMonthCostByEmployeeMonth(
      tx,
      context.organizationId,
      parsed.data.employeeId,
      parsed.data.yearMonth,
    );

    let month: EmployeeMonthCostRow;
    if (!existing) {
      month = await insertEmployeeMonthCostDraft(tx, {
        organizationId: context.organizationId,
        employeeId: parsed.data.employeeId,
        yearMonth: parsed.data.yearMonth,
        currency,
        estimatedAmount:
          derived.knownQuality === 'estimated'
            ? derived.knownAmount.amount
            : derived.estimatedAmount,
        actualAmount: derived.actualAmount,
        knownAmount: derived.knownAmount.amount,
        knownQuality: derived.knownQuality,
        notes: parsed.data.notes ?? null,
      });
    } else if (existing.status !== 'draft') {
      throw new DomainRuleError(
        'Applied or closed month costs cannot be edited in place',
        'workforce.errors.monthCostImmutable',
      );
    } else {
      const updated = await updateEmployeeMonthCostDraft(tx, context.organizationId, existing.id, {
        estimatedAmount:
          derived.knownQuality === 'estimated'
            ? derived.knownAmount.amount
            : derived.estimatedAmount,
        actualAmount: derived.actualAmount,
        knownAmount: derived.knownAmount.amount,
        knownQuality: derived.knownQuality,
        notes: parsed.data.notes ?? null,
      });
      if (!updated) throw new NotFoundError('Employee month cost');
      month = updated;
    }

    if (allocationLines.length === 0 && parsed.data.method === undefined) {
      return { month, run: await findActiveLaborAllocationRun(tx, context.organizationId, month.id) };
    }

    const resolution = resolveMonthlyAllocationAmounts({
      knownAmount: money(month.knownAmount, month.currency),
      method,
      lines: allocationLines.map((line) => ({
        projectId: line.projectId,
        hours: emptyToNull(line.hours),
        days: emptyToNull(line.days),
        percent: emptyToNull(line.percent),
        amount: emptyToNull(line.amount),
        notes: line.notes ?? null,
      })),
    });

    const prior = await findActiveLaborAllocationRun(tx, context.organizationId, month.id);
    if (prior?.status === 'applied') {
      await supersedeActiveLaborRunsForMonth(tx, context.organizationId, month.id);
    } else if (prior?.status === 'draft') {
      await deleteDraftLaborAllocationRun(tx, context.organizationId, prior.id);
    }

    const run = await insertDraftLaborAllocationRun(tx, {
      organizationId: context.organizationId,
      employeeMonthCostId: month.id,
      method,
      currency: month.currency,
      allocatedAmount: resolution.allocatedAmount.amount,
      unallocatedAmount: resolution.unallocatedAmount.amount,
      supersedesRunId: prior?.status === 'applied' ? prior.id : null,
      lines: resolution.lines.map((line) => ({
        projectId: line.projectId,
        amount: line.amount.amount,
        currency: month.currency,
        percent: line.percent,
        basisHours: line.basisHours,
        basisDays: line.basisDays,
        sortOrder: line.sortOrder,
        notes: line.notes,
      })),
    });

    return { month, run };
  });
}

export async function applyMonthlyEmployerCostAllocation(
  context: OrgContext,
  rawInput: ApplyMonthlyEmployerCostAllocationInput,
): Promise<{
  readonly month: EmployeeMonthCostRow;
  readonly run: LaborAllocationRunRow;
}> {
  assertMonthCostsGate();

  const parsed = applyMonthlyEmployerCostAllocationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  await assertEmployeeMonthCostWritable(context, parsed.data.employeeId);

  const { assertMonthOpenForRewrite } = await import('@/modules/month-close');
  await assertMonthOpenForRewrite(context, parsed.data.yearMonth);

  return withTransaction(context.db, async (tx) => {
    const month = await findEmployeeMonthCostByEmployeeMonth(
      tx,
      context.organizationId,
      parsed.data.employeeId,
      parsed.data.yearMonth,
    );
    if (!month) throw new NotFoundError('Employee month cost');
    if (month.status === 'closed') {
      throw new DomainRuleError(
        'Closed month costs cannot be re-applied',
        'workforce.errors.monthCostClosed',
      );
    }

    let run =
      parsed.data.runId != null
        ? await findLaborAllocationRunById(tx, context.organizationId, parsed.data.runId)
        : await findActiveLaborAllocationRun(tx, context.organizationId, month.id);

    if (!run) {
      // Apply with no project lines → 100% visible unallocated (still displaces time snapshots).
      run = await insertDraftLaborAllocationRun(tx, {
        organizationId: context.organizationId,
        employeeMonthCostId: month.id,
        method: 'fixed_amount',
        currency: month.currency,
        allocatedAmount: '0',
        unallocatedAmount: month.knownAmount,
        lines: [],
      });
    }

    if (run.employeeMonthCostId !== month.id) {
      throw new NotFoundError('Labor allocation run');
    }
    if (run.status === 'applied') {
      return { month, run };
    }
    if (run.status !== 'draft') {
      throw new DomainRuleError(
        'Only draft allocation runs can be applied',
        'workforce.errors.allocationRunNotDraft',
      );
    }

    const applied = await applyLaborAllocationRun(tx, context.organizationId, run.id);
    if (!applied) throw new NotFoundError('Labor allocation run');

    const refreshed = await findEmployeeMonthCostByEmployeeMonth(
      tx,
      context.organizationId,
      parsed.data.employeeId,
      parsed.data.yearMonth,
    );
    if (!refreshed) throw new NotFoundError('Employee month cost');

    return { month: refreshed, run: applied };
  });
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
