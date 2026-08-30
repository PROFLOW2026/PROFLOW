/**
 * One round trip for current-month monthly labor preview inputs (project-scoped).
 */

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import { sqlRows } from '@/modules/financials/data/sql-rows';
import type { EmployeeRecord, LaborCostComponentRecord, RateVersionRecord } from '../domain/types';

export type MonthlyLaborPreviewBundleRow = {
  readonly employeeId: string;
  readonly hireDate: string | null;
  readonly endDate: string | null;
  readonly rateVersionId: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly baseRate: string;
  readonly rateCurrency: string;
  readonly rateUnit: string;
  readonly burdenPercent: string | null;
  readonly workingDaysPerMonth: string | null;
  readonly componentId: string | null;
  readonly componentKey: string | null;
  readonly componentLabel: string | null;
  readonly componentBasis: string | null;
  readonly componentAmount: string | null;
  readonly componentPercent: string | null;
  readonly componentCurrency: string | null;
  readonly workDate: string | null;
  readonly hours: string | null;
  readonly entryKind: string | null;
  readonly entryProjectId: string | null;
};

export async function loadMonthlyLaborPreviewBundleForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  fromDate: string,
  monthEnd: string,
): Promise<readonly MonthlyLaborPreviewBundleRow[]> {
  return sqlRows<MonthlyLaborPreviewBundleRow>(
    await db.execute(sql`
      with project_monthly_employees as (
        select distinct te.employee_id
        from time_entries te
        where te.organization_id = ${organizationId}::uuid
          and te.project_id = ${projectId}::uuid
          and te.kind = 'project'
          and te.status = 'recorded'
          and te.approval_status = 'approved'
          and te.archived_at is null
          and te.work_date >= ${fromDate}::date
          and te.work_date <= ${monthEnd}::date
          and exists (
            select 1
            from rate_versions rv
            where rv.employee_id = te.employee_id
              and rv.organization_id = te.organization_id
              and rv.rate_unit = 'monthly'
          )
      )
      select
        e.id as "employeeId",
        e.hire_date as "hireDate",
        e.end_date as "endDate",
        rv.id as "rateVersionId",
        rv.valid_from as "validFrom",
        rv.valid_to as "validTo",
        rv.base_rate as "baseRate",
        rv.currency as "rateCurrency",
        rv.rate_unit as "rateUnit",
        rv.burden_percent as "burdenPercent",
        rv.working_days_per_month as "workingDaysPerMonth",
        lcc.id as "componentId",
        lcc.key as "componentKey",
        lcc.label as "componentLabel",
        lcc.basis as "componentBasis",
        lcc.amount as "componentAmount",
        lcc.percent as "componentPercent",
        lcc.currency as "componentCurrency",
        te.work_date as "workDate",
        te.hours as "hours",
        te.kind as "entryKind",
        te.project_id as "entryProjectId"
      from project_monthly_employees pme
      inner join employees e
        on e.id = pme.employee_id
        and e.organization_id = ${organizationId}::uuid
      inner join rate_versions rv
        on rv.employee_id = e.id
        and rv.organization_id = ${organizationId}::uuid
        and rv.rate_unit = 'monthly'
      left join labor_cost_components lcc
        on lcc.rate_version_id = rv.id
        and lcc.organization_id = ${organizationId}::uuid
      left join time_entries te
        on te.employee_id = e.id
        and te.organization_id = ${organizationId}::uuid
        and te.work_date >= ${fromDate}::date
        and te.work_date <= ${monthEnd}::date
        and te.status = 'recorded'
        and te.approval_status = 'approved'
        and te.archived_at is null
      order by e.id, rv.valid_from, te.work_date
    `),
  );
}

export function foldMonthlyLaborPreviewBundle(
  rows: readonly MonthlyLaborPreviewBundleRow[],
  organizationId: string,
): {
  readonly employees: Map<string, EmployeeRecord>;
  readonly versionsByEmployee: Map<string, RateVersionRecord[]>;
  readonly componentsByRateId: Map<string, LaborCostComponentRecord[]>;
  readonly entriesByEmployee: Map<
    string,
    { workDate: string; hours: string; kind: 'project' | 'non_project'; projectId: string | null }[]
  >;
} {
  const employees = new Map<string, EmployeeRecord>();
  const versionsByEmployee = new Map<string, RateVersionRecord[]>();
  const componentsByRateId = new Map<string, LaborCostComponentRecord[]>();
  const entriesByEmployee = new Map<
    string,
    { workDate: string; hours: string; kind: 'project' | 'non_project'; projectId: string | null }[]
  >();

  for (const row of rows) {
    if (!employees.has(row.employeeId)) {
      employees.set(row.employeeId, {
        id: row.employeeId,
        organizationId,
        name: '',
        status: 'active',
        userId: null,
        employeeNumber: null,
        jobTitle: null,
        email: null,
        phone: null,
        notes: null,
        hireDate: row.hireDate,
        endDate: row.endDate,
        employmentBasis: null,
        standardHoursPerDay: null,
        archivedAt: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      });
    }

    const versions = versionsByEmployee.get(row.employeeId) ?? [];
    if (!versions.some((version) => version.id === row.rateVersionId)) {
      versions.push({
        id: row.rateVersionId,
        organizationId,
        employeeId: row.employeeId,
        validFrom: row.validFrom,
        validTo: row.validTo,
        baseRate: row.baseRate,
        rateUnit: row.rateUnit as RateVersionRecord['rateUnit'],
        currency: row.rateCurrency,
        burdenPercent: row.burdenPercent,
        correctsRateVersionId: null,
        workingDaysPerMonth: row.workingDaysPerMonth,
        notes: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      });
      versionsByEmployee.set(row.employeeId, versions);
    }

    if (row.componentId && row.componentKey) {
      const list = componentsByRateId.get(row.rateVersionId) ?? [];
      if (!list.some((component) => component.id === row.componentId)) {
        list.push({
          id: row.componentId,
          organizationId,
          rateVersionId: row.rateVersionId,
          key: row.componentKey,
          label: row.componentLabel ?? row.componentKey,
          basis: (row.componentBasis ?? 'amount') as LaborCostComponentRecord['basis'],
          amount: row.componentAmount,
          percent: row.componentPercent,
          currency: row.componentCurrency ?? row.rateCurrency,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        });
        componentsByRateId.set(row.rateVersionId, list);
      }
    }

    if (row.workDate && row.hours && row.entryKind) {
      const entries = entriesByEmployee.get(row.employeeId) ?? [];
      entries.push({
        workDate: row.workDate,
        hours: row.hours,
        kind: row.entryKind as 'project' | 'non_project',
        projectId: row.entryProjectId,
      });
      entriesByEmployee.set(row.employeeId, entries);
    }
  }

  return { employees, versionsByEmployee, componentsByRateId, entriesByEmployee };
}
