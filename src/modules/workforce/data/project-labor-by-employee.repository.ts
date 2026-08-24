import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  employeeMonthCosts,
  employees,
  laborAllocationRunLines,
  laborAllocationRuns,
  timeEntries,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  addMoney,
  fromNumericString,
  isZeroMoney,
  roundMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import {
  effectiveLaborCostAmountExpr,
  notDisplacedByMonthlyAllocation,
} from './time-entries.repository';
import { areEmployeeMonthCostsAvailable } from '../domain/monthly-cost-gates';

export interface ProjectLaborEmployeePeriodRow {
  readonly yearMonth: string;
  readonly hours: string;
  readonly workDays: number;
  readonly laborCost: MoneyValue | null;
  readonly entriesMissingCost: number;
  readonly source: 'time' | 'monthly_allocation';
}

export interface ProjectLaborEmployeeRow {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly hours: string;
  readonly workDays: number;
  readonly laborCost: MoneyValue | null;
  readonly entriesMissingCost: number;
  readonly periods: readonly ProjectLaborEmployeePeriodRow[];
}

export interface ProjectLaborByEmployeeAggregate {
  readonly projectId: string;
  readonly currency: string;
  readonly totalLaborCost: MoneyValue;
  readonly hasWorkforceData: boolean;
  readonly entriesMissingCost: number;
  readonly employees: readonly ProjectLaborEmployeeRow[];
}

/**
 * Shared project labor Actual by employee/period (Overview / Financials / Team / Time).
 * Same residual-time + monthly-allocation rules as getProjectLaborCost — set-based.
 */
export async function loadProjectLaborByEmployee(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<ProjectLaborByEmployeeAggregate> {
  const normalized = currency.toUpperCase();
  const displacement = notDisplacedByMonthlyAllocation(db, organizationId);
  const effectiveCost = effectiveLaborCostAmountExpr();

  const timeRows = await db
    .select({
      employeeId: timeEntries.employeeId,
      employeeName: employees.name,
      yearMonth: sql<string>`to_char(${timeEntries.workDate}::date, 'YYYY-MM')`,
      hours: sql<string>`coalesce(sum(${timeEntries.hours}), 0)::text`,
      workDays: sql<number>`count(distinct ${timeEntries.workDate})::int`,
      laborCost: sql<string | null>`coalesce(
        sum(${effectiveCost}) filter (
          where ${timeEntries.costAmount} is not null
            and upper(${timeEntries.costCurrency}) = upper(${normalized})
        ),
        0
      )::text`,
      entriesMissingCost: sql<number>`count(*) filter (where ${timeEntries.costAmount} is null)::int`,
      entryCount: sql<number>`count(*)::int`,
    })
    .from(timeEntries)
    .innerJoin(employees, eq(employees.id, timeEntries.employeeId))
    .where(
      and(
        eq(timeEntries.organizationId, organizationId),
        eq(timeEntries.projectId, projectId),
        eq(timeEntries.kind, 'project'),
        eq(timeEntries.status, 'recorded'),
        eq(timeEntries.approvalStatus, 'approved'),
        isNull(timeEntries.archivedAt),
        ...(displacement ? [displacement] : []),
      ),
    )
    .groupBy(
      timeEntries.employeeId,
      employees.name,
      sql`to_char(${timeEntries.workDate}::date, 'YYYY-MM')`,
    );

  type Acc = {
    employeeId: string;
    employeeName: string;
    hours: number;
    workDays: number;
    laborCost: MoneyValue;
    entriesMissingCost: number;
    hasCost: boolean;
    periods: ProjectLaborEmployeePeriodRow[];
  };

  const byEmployee = new Map<string, Acc>();

  for (const row of timeRows) {
    const periodCost =
      row.entriesMissingCost > 0 && Number(row.laborCost ?? '0') === 0
        ? null
        : fromNumericString(row.laborCost ?? '0', normalized) ?? zeroMoney(normalized);

    const period: ProjectLaborEmployeePeriodRow = {
      yearMonth: row.yearMonth,
      hours: row.hours,
      workDays: row.workDays,
      laborCost: periodCost,
      entriesMissingCost: row.entriesMissingCost,
      source: 'time',
    };

    const existing = byEmployee.get(row.employeeId);
    if (!existing) {
      byEmployee.set(row.employeeId, {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        hours: Number(row.hours) || 0,
        workDays: row.workDays,
        laborCost: periodCost ?? zeroMoney(normalized),
        entriesMissingCost: row.entriesMissingCost,
        hasCost: periodCost != null && row.entriesMissingCost === 0,
        periods: [period],
      });
      continue;
    }

    existing.hours += Number(row.hours) || 0;
    existing.workDays += row.workDays;
    existing.entriesMissingCost += row.entriesMissingCost;
    if (periodCost) {
      existing.laborCost = addMoney(existing.laborCost, periodCost);
    }
    if (row.entriesMissingCost > 0) existing.hasCost = false;
    existing.periods.push(period);
  }

  if (areEmployeeMonthCostsAvailable()) {
    const monthlyRows = await db
      .select({
        employeeId: employeeMonthCosts.employeeId,
        employeeName: employees.name,
        yearMonth: employeeMonthCosts.yearMonth,
        amount: laborAllocationRunLines.amount,
        currency: laborAllocationRunLines.currency,
        basisHours: laborAllocationRunLines.basisHours,
      })
      .from(laborAllocationRunLines)
      .innerJoin(
        laborAllocationRuns,
        and(
          eq(laborAllocationRunLines.laborAllocationRunId, laborAllocationRuns.id),
          eq(laborAllocationRunLines.organizationId, laborAllocationRuns.organizationId),
        ),
      )
      .innerJoin(
        employeeMonthCosts,
        and(
          eq(laborAllocationRuns.employeeMonthCostId, employeeMonthCosts.id),
          eq(laborAllocationRuns.organizationId, employeeMonthCosts.organizationId),
        ),
      )
      .innerJoin(employees, eq(employees.id, employeeMonthCosts.employeeId))
      .where(
        and(
          eq(laborAllocationRunLines.organizationId, organizationId),
          eq(laborAllocationRunLines.projectId, projectId),
          eq(laborAllocationRuns.status, 'applied'),
          inArray(employeeMonthCosts.status, ['applied', 'closed']),
          eq(employeeMonthCosts.recognitionSource, 'monthly_allocated'),
          sql`upper(${laborAllocationRunLines.currency}) = upper(${normalized})`,
        ),
      );

    // Approved project work days/hours for display (attribution basis), even when
    // cost is displaced to monthly allocation — one set-based query, not N+1.
    const monthlyEmployeeIds = [...new Set(monthlyRows.map((r) => r.employeeId))];
    const displayDaysByKey = new Map<string, { hours: number; workDays: number }>();
    if (monthlyEmployeeIds.length > 0) {
      const displayRows = await db
        .select({
          employeeId: timeEntries.employeeId,
          yearMonth: sql<string>`to_char(${timeEntries.workDate}::date, 'YYYY-MM')`,
          hours: sql<string>`coalesce(sum(${timeEntries.hours}), 0)::text`,
          workDays: sql<number>`count(distinct ${timeEntries.workDate})::int`,
        })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.organizationId, organizationId),
            eq(timeEntries.projectId, projectId),
            eq(timeEntries.kind, 'project'),
            eq(timeEntries.status, 'recorded'),
            eq(timeEntries.approvalStatus, 'approved'),
            isNull(timeEntries.archivedAt),
            inArray(timeEntries.employeeId, monthlyEmployeeIds),
          ),
        )
        .groupBy(
          timeEntries.employeeId,
          sql`to_char(${timeEntries.workDate}::date, 'YYYY-MM')`,
        );

      for (const row of displayRows) {
        displayDaysByKey.set(`${row.employeeId}:${row.yearMonth}`, {
          hours: Number(row.hours) || 0,
          workDays: row.workDays,
        });
      }
    }

    for (const row of monthlyRows) {
      const amount = fromNumericString(row.amount, row.currency);
      if (!amount || isZeroMoney(amount)) continue;

      const display = displayDaysByKey.get(`${row.employeeId}:${row.yearMonth}`);
      const basisHoursNum = Number(row.basisHours ?? '0');
      const hoursFromBasis =
        Number.isFinite(basisHoursNum) && basisHoursNum > 0 ? basisHoursNum : display?.hours ?? 0;
      const workDays = display?.workDays ?? 0;

      const period: ProjectLaborEmployeePeriodRow = {
        yearMonth: row.yearMonth,
        hours: hoursFromBasis.toFixed(2),
        workDays,
        laborCost: amount,
        entriesMissingCost: 0,
        source: 'monthly_allocation',
      };

      const existing = byEmployee.get(row.employeeId);
      if (!existing) {
        byEmployee.set(row.employeeId, {
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          hours: hoursFromBasis,
          workDays,
          laborCost: amount,
          entriesMissingCost: 0,
          hasCost: true,
          periods: [period],
        });
        continue;
      }

      // Prefer monthly period over residual-time period for the same yearMonth.
      const priorIdx = existing.periods.findIndex(
        (p) => p.yearMonth === row.yearMonth && p.source === 'time',
      );
      if (priorIdx >= 0) {
        const prior = existing.periods[priorIdx]!;
        existing.hours -= Number(prior.hours) || 0;
        existing.workDays -= prior.workDays;
        if (prior.laborCost) {
          existing.laborCost = subtractMoney(existing.laborCost, prior.laborCost);
        }
        existing.periods.splice(priorIdx, 1);
      }

      existing.hours += hoursFromBasis;
      existing.workDays += workDays;
      existing.laborCost = addMoney(existing.laborCost, amount);
      existing.periods.push(period);
    }
  }

  const employeesOut: ProjectLaborEmployeeRow[] = [];
  let totalLaborCost = zeroMoney(normalized);
  let entriesMissingCost = 0;
  let hasWorkforceData = false;

  for (const acc of byEmployee.values()) {
    hasWorkforceData = true;
    entriesMissingCost += acc.entriesMissingCost;
    const costUnresolved = acc.entriesMissingCost > 0;
    const laborCost = costUnresolved ? null : roundMoney(acc.laborCost);
    if (laborCost) totalLaborCost = addMoney(totalLaborCost, laborCost);

    employeesOut.push({
      employeeId: acc.employeeId,
      employeeName: acc.employeeName,
      hours: acc.hours.toFixed(2),
      workDays: acc.workDays,
      laborCost,
      entriesMissingCost: acc.entriesMissingCost,
      periods: [...acc.periods].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth)),
    });
  }

  employeesOut.sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'he'));

  return {
    projectId,
    currency: normalized,
    totalLaborCost: roundMoney(totalLaborCost),
    hasWorkforceData,
    entriesMissingCost,
    employees: employeesOut,
  };
}
