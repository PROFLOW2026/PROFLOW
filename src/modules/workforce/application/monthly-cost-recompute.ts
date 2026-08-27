/**
 * Automatic monthly employer-cost allocation for MONTHLY employees only.
 *
 * Open month: recognize accrued working-day cost
 * (P / calendarEligibleWorkdays × accruedDays), attribute day-by-day via approved hours.
 * Denominator = configured work weekdays in the calendar month (with rate coverage);
 * optional workingDaysPerMonth is fallback only when the calendar count is 0.
 * Never apply the full month early. Past / completed calendar months: full pool.
 * HOURLY / DAILY paths are untouched.
 */

import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { toNumericString } from '@/shared/money';
import { withTransaction } from '@/shared/db';
import type { OrgContext } from '@/shared/auth/context';
import { isMonthClosed } from '@/modules/month-close';
import {
  LABOR_COST_DEFAULTS_SETTING_KEY,
  parseLaborCostDefaults,
  resolveOrgWorkWeekdays,
  getOrganizationSettingValue,
} from '@/modules/tenancy';
import { todayInTimeZone } from '@/shared/dates';
import { findEmployeeById } from '../data/employees.repository';
import {
  findEmployeeMonthCostByEmployeeMonth,
  insertEmployeeMonthCostDraft,
  supersedeEmployeeMonthCost,
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
import { NON_PROJECT_COST_BUCKET } from '../domain/conserved-hour-allocation';
import { calculateMonthlyEmployerCostPoolForMonth } from '../domain/employer-cost-pool';
import { areEmployeeMonthCostsAvailable } from '../domain/monthly-cost-gates';
import {
  allocateMonthlyRecognizedPoolByWorkDays,
  listConfiguredWorkDatesInRange,
  monthDateBounds,
  pickWorkingDaysPerMonthForMonth,
  recognizeMonthlyEmployerPoolByCalendar,
} from '../domain/monthly-accrual';
import type { RateVersionRecord } from '../domain/types';

export interface MonthlyCostRecomputeResult {
  readonly skipped: boolean;
  readonly reason:
    | null
    | 'month_costs_unavailable'
    | 'not_monthly'
    | 'no_monthly_pool'
    | 'working_days_unavailable'
    | 'month_closed'
    | 'future_month'
    | 'employee_missing';
  readonly yearMonth: string;
  readonly employeeId: string;
  readonly knownAmount: string | null;
  readonly allocatedToProjects: string | null;
  readonly unallocated: string | null;
  readonly workingDaysPerMonth: string | null;
  readonly recognizedWorkDayCount: number | null;
  readonly recognizeFullMonth: boolean | null;
}

/**
 * Idempotent open-month recompute for one monthly employee.
 * Closed org months and closed employee-month rows are skipped.
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
    workingDaysPerMonth: null,
    recognizedWorkDayCount: null,
    recognizeFullMonth: null,
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
    return { ...base, reason: 'not_monthly' };
  }

  const defaultsRaw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    LABOR_COST_DEFAULTS_SETTING_KEY,
  );
  const laborDefaults = parseLaborCostDefaults(defaultsRaw);
  const fallbackWorkingDaysPerMonth = pickWorkingDaysPerMonthForMonth({
    yearMonth,
    versions,
    orgWorkingDaysPerMonth: laborDefaults.workingDaysPerMonth,
  });

  const workWeekdays = resolveOrgWorkWeekdays(laborDefaults);
  const { fromDate, toDate: monthEnd } = monthDateBounds(yearMonth);
  const today = todayInTimeZone(context.organization.timezone);
  const currentYearMonth = today.slice(0, 7);
  if (yearMonth > currentYearMonth) {
    return { ...base, reason: 'future_month' };
  }
  const recognizeFullMonth = yearMonth < currentYearMonth || today >= monthEnd;
  const asOfDate = recognizeFullMonth ? monthEnd : today;

  const coverageStart =
    employee.hireDate && employee.hireDate > fromDate ? employee.hireDate : fromDate;
  const coverageEnd =
    employee.endDate && employee.endDate < asOfDate ? employee.endDate : asOfDate;
  const rangeStart = coverageStart;
  const rangeEnd = coverageEnd < rangeStart ? rangeStart : coverageEnd;

  const hasCoverage = (date: string): boolean => {
    if (employee.hireDate && date < employee.hireDate) return false;
    if (employee.endDate && date > employee.endDate) return false;
    return versions.some(
      (v) =>
        v.rateUnit === 'monthly' &&
        v.validFrom <= date &&
        (v.validTo == null || v.validTo >= date),
    );
  };

  const totalEligibleWorkDates = listConfiguredWorkDatesInRange({
    fromDate,
    toDate: monthEnd,
    workWeekdays,
    hasCoverage,
  });
  const workDates = listConfiguredWorkDatesInRange({
    fromDate: rangeStart,
    toDate: rangeEnd,
    workWeekdays,
    hasCoverage,
  });

  const recognition = recognizeMonthlyEmployerPoolByCalendar({
    fullMonthlyEmployerCost: poolResult.pool,
    totalEligibleWorkdaysInMonth: totalEligibleWorkDates.length,
    accruedWorkDayCount: workDates.length,
    recognizeFullMonth,
    fallbackWorkingDaysPerMonth,
  });
  if (!recognition) {
    return { ...base, reason: 'working_days_unavailable' };
  }
  const workingDaysPerMonth = recognition.workingDaysPerMonth;

  const entries = await listTimeEntries(context.db, context.organizationId, {
    employeeId,
    fromDate,
    toDate: monthEnd,
    forCosting: true,
    limit: 10_000,
  });

  const hoursByDate = new Map<string, { key: string; hours: string }[]>();
  for (const entry of entries) {
    if (!recognizeFullMonth && entry.workDate > asOfDate) {
      continue;
    }
    const hours = Number(entry.hours);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    const key =
      entry.kind === 'project' && entry.projectId ? entry.projectId : NON_PROJECT_COST_BUCKET;
    const list = hoursByDate.get(entry.workDate) ?? [];
    const existing = list.find((b) => b.key === key);
    if (existing) {
      existing.hours = String(Number(existing.hours) + hours);
    } else {
      list.push({ key, hours: String(hours) });
    }
    hoursByDate.set(entry.workDate, list);
  }

  const allocation = allocateMonthlyRecognizedPoolByWorkDays({
    recognizedPool: recognition.recognizedPool,
    fullMonthlyEmployerCost: poolResult.pool,
    workingDaysPerMonth,
    workDates,
    hoursByDate,
  });

  const knownAmountStr = toNumericString(recognition.recognizedPool);
  const fullExpectedStr = toNumericString(poolResult.pool);

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

    // Reopen applied months for rewrite. Superseding an applied run demotes the
    // month to draft via SQL displacement. If the month stays applied (orphan /
    // draft-only inconsistency), supersede the month row and insert a fresh draft.
    if (month?.status === 'applied') {
      const active = await findActiveLaborAllocationRun(tx, context.organizationId, month.id);
      if (active) {
        // Applied run → displacement demotes month to draft.
        // Draft run alone does not demote an applied month — delete it, then
        // fall through to month-row supersede if still applied.
        if (active.status === 'applied') {
          await supersedeActiveLaborRunsForMonth(tx, context.organizationId, month.id);
        } else if (active.status === 'draft') {
          await deleteDraftLaborAllocationRun(tx, context.organizationId, active.id);
        }
      }

      month = await findEmployeeMonthCostByEmployeeMonth(
        tx,
        context.organizationId,
        employeeId,
        yearMonth,
      );

      if (month?.status === 'applied') {
        // Orphan applied month (no applied run left to demote via trigger).
        await supersedeActiveLaborRunsForMonth(tx, context.organizationId, month.id);
        await supersedeEmployeeMonthCost(tx, context.organizationId, month.id);
        month = null;
      }
    }

    const accrualNotes = `Auto monthly accrual (full month expected ${fullExpectedStr}; ${workingDaysPerMonth} work days/mo; recognized ${recognition.recognizedWorkDayCount} day(s))`;

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
        notes: accrualNotes,
      });
    } else if (month.status === 'draft') {
      const updated = await updateEmployeeMonthCostDraft(tx, context.organizationId, month.id, {
        estimatedAmount: knownAmountStr,
        actualAmount: null,
        knownAmount: knownAmountStr,
        knownQuality: 'estimated',
        notes: accrualNotes,
      });
      if (!updated) throw new NotFoundError('Employee month cost');
      month = updated;
    } else {
      throw new DomainRuleError(
        `Unexpected month cost status during recompute: ${month.status}`,
        'workforce.errors.monthCostImmutable',
      );
    }

    const prior = await findActiveLaborAllocationRun(tx, context.organizationId, month.id);
    if (prior?.status === 'applied') {
      await supersedeActiveLaborRunsForMonth(tx, context.organizationId, month.id);
      // Displacement may have flipped month; ensure we still have a draft row.
      const afterSupersede = await findEmployeeMonthCostByEmployeeMonth(
        tx,
        context.organizationId,
        employeeId,
        yearMonth,
      );
      if (afterSupersede?.status === 'applied') {
        await supersedeEmployeeMonthCost(tx, context.organizationId, afterSupersede.id);
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
          notes: accrualNotes,
        });
      } else if (afterSupersede) {
        month = afterSupersede;
      }
    } else if (prior?.status === 'draft') {
      await deleteDraftLaborAllocationRun(tx, context.organizationId, prior.id);
    }

    const run = await insertDraftLaborAllocationRun(tx, {
      organizationId: context.organizationId,
      employeeMonthCostId: month.id,
      method: 'days',
      currency,
      allocatedAmount: toNumericString(allocation.allocatedToProjects),
      unallocatedAmount: toNumericString(allocation.nonProjectOrUnallocated),
      explanation: `Monthly accrued allocation (${recognition.recognizedWorkDayCount} work day(s) × derived daily)`,
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
    workingDaysPerMonth,
    recognizedWorkDayCount: recognition.recognizedWorkDayCount,
    recognizeFullMonth,
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
 * plus the current calendar month (so admin/no-time months still accrue).
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
  const today = todayInTimeZone(context.organization.timezone);
  months.add(today.slice(0, 7));

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
