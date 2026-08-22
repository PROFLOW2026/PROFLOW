/**
 * Automatic monthly employer-cost allocation for MONTHLY employees.
 *
 * Derives the month pool from effective compensation + burden/components,
 * allocates by approved project vs non-project hours, applies the run
 * (displacement), and never converts monthly pay via workingDaysPerMonth.
 */

import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { toNumericString } from '@/shared/money';
import { withTransaction } from '@/shared/db';
import type { OrgContext } from '@/shared/auth/context';
import { isMonthClosed } from '@/modules/month-close';
import { findEmployeeById } from '../data/employees.repository';
import {
  findEmployeeMonthCostByEmployeeMonth,
  insertEmployeeMonthCostDraft,
  updateEmployeeMonthCostDraft,
} from '../data/employee-month-costs.repository';
import {
  applyLaborAllocationRun,
  deleteDraftLaborAllocationRun,
  findActiveLaborAllocationRun,
  insertDraftLaborAllocationRun,
  supersedeActiveLaborRunsForMonth,
} from '../data/labor-allocation.repository';
import {
  listComponentsByRateVersions,
  listRateVersionsByEmployee,
} from '../data/rate-versions.repository';
import { listTimeEntries } from '../data/time-entries.repository';
import {
  allocateConservedAmountByHours,
  NON_PROJECT_COST_BUCKET,
} from '../domain/conserved-hour-allocation';
import { calculateMonthlyEmployerCostPoolForMonth } from '../domain/employer-cost-pool';
import { areEmployeeMonthCostsAvailable } from '../domain/monthly-cost-gates';
import type { RateVersionRecord } from '../domain/types';

function daysInCalendarMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

export interface MonthlyCostRecomputeResult {
  readonly skipped: boolean;
  readonly reason:
    | null
    | 'month_costs_unavailable'
    | 'not_monthly'
    | 'no_monthly_pool'
    | 'month_closed'
    | 'employee_missing';
  readonly yearMonth: string;
  readonly employeeId: string;
  readonly knownAmount: string | null;
  readonly allocatedToProjects: string | null;
  readonly unallocated: string | null;
}

/**
 * Idempotent open-month recompute for one monthly employee.
 * Closed months are skipped (historical correction path).
 */
export async function recomputeMonthlyEmployeeCostForOpenMonth(
  context: OrgContext,
  input: { readonly employeeId: string; readonly yearMonth: string },
): Promise<MonthlyCostRecomputeResult> {
  const { employeeId, yearMonth } = input;
  const base = {
    skipped: true as const,
    yearMonth,
    employeeId,
    knownAmount: null,
    allocatedToProjects: null,
    unallocated: null,
  };

  if (!areEmployeeMonthCostsAvailable()) {
    return { ...base, reason: 'month_costs_unavailable' };
  }

  const employee = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!employee) {
    return { ...base, reason: 'employee_missing' };
  }

  if (await isMonthClosed(context, yearMonth)) {
    return { ...base, reason: 'month_closed' };
  }

  const versions = await listRateVersionsByEmployee(
    context.db,
    context.organizationId,
    employeeId,
  );
  const currency = context.organization.baseCurrency.toUpperCase();

  const rateIds = versions.map((v) => v.id);
  const components =
    rateIds.length > 0
      ? await listComponentsByRateVersions(context.db, context.organizationId, rateIds)
      : [];
  const componentsByRateId = new Map<string, typeof components>();
  for (const component of components) {
    const list = componentsByRateId.get(component.rateVersionId) ?? [];
    list.push(component);
    componentsByRateId.set(component.rateVersionId, list);
  }

  const poolResult = calculateMonthlyEmployerCostPoolForMonth({
    yearMonth,
    currency,
    versions: versions.map((v) => ({
      id: v.id,
      validFrom: v.validFrom,
      validTo: v.validTo,
      baseRate: v.baseRate,
      currency: v.currency,
      rateUnit: v.rateUnit,
      burdenPercent: v.burdenPercent,
      components: componentsByRateId.get(v.id) ?? [],
    })),
  });

  if (!poolResult) {
    // Not a monthly employee for this month (hourly/daily/no rate).
    return { ...base, reason: 'not_monthly' };
  }

  const lastDay = String(daysInCalendarMonth(yearMonth)).padStart(2, '0');
  const fromDate = `${yearMonth}-01`;
  const toDate = `${yearMonth}-${lastDay}`;

  const entries = await listTimeEntries(context.db, context.organizationId, {
    employeeId,
    fromDate,
    toDate,
    forCosting: true,
    limit: 10_000,
  });

  const hoursByProject = new Map<string, number>();
  let nonProjectHours = 0;
  for (const entry of entries) {
    const hours = Number(entry.hours);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    if (entry.kind === 'project' && entry.projectId) {
      hoursByProject.set(entry.projectId, (hoursByProject.get(entry.projectId) ?? 0) + hours);
    } else {
      nonProjectHours += hours;
    }
  }

  const buckets = [
    ...[...hoursByProject.entries()].map(([projectId, hours]) => ({
      key: projectId,
      hours: String(hours),
    })),
    ...(nonProjectHours > 0
      ? [{ key: NON_PROJECT_COST_BUCKET, hours: String(nonProjectHours) }]
      : []),
  ];

  const allocation = allocateConservedAmountByHours({
    knownAmount: poolResult.pool,
    buckets,
  });

  const knownAmountStr = toNumericString(poolResult.pool);

  await withTransaction(context.db, async (tx) => {
    let month = await findEmployeeMonthCostByEmployeeMonth(
      tx,
      context.organizationId,
      employeeId,
      yearMonth,
    );

    if (month?.status === 'closed') {
      throw new DomainRuleError(
        'Closed month costs cannot be recomputed',
        'workforce.errors.monthCostClosed',
      );
    }

    if (month?.status === 'applied') {
      const active = await findActiveLaborAllocationRun(tx, context.organizationId, month.id);
      if (active?.status === 'applied') {
        await supersedeActiveLaborRunsForMonth(tx, context.organizationId, month.id);
      }
      month = await findEmployeeMonthCostByEmployeeMonth(
        tx,
        context.organizationId,
        employeeId,
        yearMonth,
      );
    }

    if (!month) {
      month = await insertEmployeeMonthCostDraft(tx, {
        organizationId: context.organizationId,
        employeeId,
        yearMonth,
        currency,
        estimatedAmount: knownAmountStr,
        actualAmount: null,
        knownAmount: knownAmountStr,
        knownQuality: 'estimated',
        source: 'compensation_derived',
        notes: 'Auto-derived from monthly compensation + approved work',
      });
    } else if (month.status === 'draft') {
      const updated = await updateEmployeeMonthCostDraft(tx, context.organizationId, month.id, {
        estimatedAmount: knownAmountStr,
        actualAmount: null,
        knownAmount: knownAmountStr,
        knownQuality: 'estimated',
        notes: 'Auto-derived from monthly compensation + approved work',
      });
      if (!updated) throw new NotFoundError('Employee month cost');
      month = updated;
    } else {
      throw new DomainRuleError(
        'Unexpected month cost status during recompute',
        'workforce.errors.monthCostImmutable',
      );
    }

    const prior = await findActiveLaborAllocationRun(tx, context.organizationId, month.id);
    if (prior?.status === 'applied') {
      await supersedeActiveLaborRunsForMonth(tx, context.organizationId, month.id);
    } else if (prior?.status === 'draft') {
      await deleteDraftLaborAllocationRun(tx, context.organizationId, prior.id);
    }

    const run = await insertDraftLaborAllocationRun(tx, {
      organizationId: context.organizationId,
      employeeMonthCostId: month.id,
      method: 'hours',
      currency,
      allocatedAmount: toNumericString(allocation.allocatedToProjects),
      unallocatedAmount: toNumericString(allocation.nonProjectOrUnallocated),
      explanation: 'Auto allocation from approved work distribution',
      supersedesRunId: prior?.status === 'applied' ? prior.id : null,
      lines: allocation.projectLines.map((line, index) => ({
        projectId: line.key,
        amount: toNumericString(line.amount),
        currency,
        percent: line.percent,
        basisHours: line.hours,
        basisDays: null,
        sortOrder: index,
        notes: null,
      })),
    });

    const applied = await applyLaborAllocationRun(tx, context.organizationId, run.id);
    if (!applied) throw new NotFoundError('Labor allocation run');
  });

  return {
    skipped: false,
    reason: null,
    yearMonth,
    employeeId,
    knownAmount: knownAmountStr,
    allocatedToProjects: toNumericString(allocation.allocatedToProjects),
    unallocated: toNumericString(allocation.nonProjectOrUnallocated),
  };
}

/** Recompute open months touched by the given work dates (plus optional extras). */
export async function recomputeMonthlyEmployeeCostsForDates(
  context: OrgContext,
  input: { readonly employeeId: string; readonly workDates: readonly string[] },
): Promise<readonly MonthlyCostRecomputeResult[]> {
  const months = [...new Set(input.workDates.map((d) => d.slice(0, 7)))].sort();
  const results: MonthlyCostRecomputeResult[] = [];
  for (const yearMonth of months) {
    results.push(
      await recomputeMonthlyEmployeeCostForOpenMonth(context, {
        employeeId: input.employeeId,
        yearMonth,
      }),
    );
  }
  return results;
}

/**
 * After compensation change: recompute open months that have approved time,
 * plus the current calendar month (so admin/no-time months still recognize cost).
 */
export async function recomputeOpenMonthsAfterCompensationChange(
  context: OrgContext,
  employeeId: string,
): Promise<readonly MonthlyCostRecomputeResult[]> {
  const versions = await listRateVersionsByEmployee(
    context.db,
    context.organizationId,
    employeeId,
  );
  if (!versions.some((v) => v.rateUnit === 'monthly')) {
    return [];
  }

  const entries = await listTimeEntries(context.db, context.organizationId, {
    employeeId,
    forCosting: true,
    limit: 10_000,
  });
  const months = new Set(entries.map((e) => e.workDate.slice(0, 7)));
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  months.add(currentMonth);

  const results: MonthlyCostRecomputeResult[] = [];
  for (const yearMonth of [...months].sort()) {
    results.push(
      await recomputeMonthlyEmployeeCostForOpenMonth(context, { employeeId, yearMonth }),
    );
  }
  return results;
}

export function isMonthlyRateEmployee(
  versions: readonly Pick<RateVersionRecord, 'rateUnit'>[],
): boolean {
  return versions.some((v) => v.rateUnit === 'monthly');
}
