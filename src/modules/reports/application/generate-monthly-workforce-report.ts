import 'server-only';

import { resolveOrgWorkWeekdays } from '@/modules/tenancy';
import { CANONICAL_WORK_WEEKDAYS } from '@/modules/tenancy/domain/labor-cost-defaults';
import { findEmployeeById, getMonthlyAttendanceGrid } from '@/modules/workforce';
import { getEmployeePeriodSummary } from '@/modules/workforce/application/employee-period-summary';
import {
  effectiveEmploymentBoundsInRange,
  employmentOverlapsDateRange,
} from '@/modules/workforce/domain/employment-active-range';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { formatMoney } from '@/shared/money/format';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { reportDirection, reportTitle, resolveReportLocale } from '../domain/copy';
import type { ReportsCopy } from '../domain/copy';
import { localizeCode } from '@/shared/i18n/code-display';
import type { ReportPayload, ReportSection } from '../domain/types';

type BuildCtx = {
  locale: string;
  copy: ReportsCopy;
  generatedAt: Date;
  companyName: string;
};

function monthBounds(yearMonth: string): { fromDate: string; toDate: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!match) throw new Error('Invalid year-month');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { fromDate, toDate };
}

function classificationLabel(
  locale: string,
  copy: ReportsCopy,
  compensationClass: string | undefined,
  employmentBasis: string | null,
): string {
  if (compensationClass === 'owner_manager') {
    return copy.workforceReport.classificationOwnerManager;
  }
  if (employmentBasis) {
    return localizeCode(locale, employmentBasis);
  }
  return copy.workforceReport.classificationEmployee;
}

export async function buildMonthlyWorkforceReport(
  context: OrgContext,
  yearMonth: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const today = todayInTimeZone(context.organization.timezone);
  const workWeekdays = resolveOrgWorkWeekdays(null) ?? CANONICAL_WORK_WEEKDAYS;
  const grid = await getMonthlyAttendanceGrid(context, {
    yearMonth,
    today,
    workWeekdays,
  });

  const { fromDate, toDate } = monthBounds(yearMonth);
  const includeCost = hasPermission(context, PERMISSIONS.WORKFORCE_COST_READ);

  const employeeSections: ReportSection[] = [];
  const monthFrom = businessDate(fromDate);
  const monthTo = businessDate(toDate);

  for (const row of grid.rows) {
    const employee = await findEmployeeById(context.db, context.organizationId, row.employeeId);
    if (!employee) continue;

    const employment = {
      hireDate: employee.hireDate ? businessDate(employee.hireDate) : null,
      endDate: employee.endDate ? businessDate(employee.endDate) : null,
    };
    if (!employmentOverlapsDateRange(employment, monthFrom, monthTo)) {
      continue;
    }

    const effectiveBounds = effectiveEmploymentBoundsInRange(employment, monthFrom, monthTo);
    if (!effectiveBounds) continue;

    const summary = await getEmployeePeriodSummary(context, {
      employeeId: row.employeeId,
      fromDate: effectiveBounds.fromDate,
      toDate: effectiveBounds.toDate,
      workWeekdays,
    });

    const workdays = String(summary.totalDays);
    const wr = ctx.copy.workforceReport;
    const hourRows: ReportSection['rows'] = summary.canSplitRegularOvertime
      ? [
          {
            label: wr.regularHours,
            value: (summary.approvedRegularHours ?? 0).toFixed(2),
          },
          {
            label: wr.overtimeHours,
            value: (summary.approvedOvertimeHours ?? 0).toFixed(2),
          },
          {
            label: wr.totalApprovedHours,
            value: summary.approvedTotalHours.toFixed(2),
          },
        ]
      : [
          {
            label: wr.totalApprovedHours,
            value: summary.approvedTotalHours.toFixed(2),
          },
        ];
    const allocationRows = summary.projectBreakdown.map((project) => [
      project.projectName,
      String(project.days),
      project.hours.toFixed(2),
      includeCost && project.allocatedCost
        ? formatMoney(project.allocatedCost, ctx.locale)
        : '—',
    ]);

    const classification = classificationLabel(
      ctx.locale,
      ctx.copy,
      employee?.compensationClass,
      employee?.employmentBasis ?? null,
    );
    const table = wr.allocationTable;

    employeeSections.push({
      id: row.employeeId,
      heading: row.employeeName,
      rows: [
        {
          label: wr.classification,
          value: classification,
        },
        {
          label: wr.workdays,
          value: workdays,
        },
        ...hourRows,
        {
          label: wr.unallocatedDays,
          value: String(summary.unallocatedDays),
        },
        {
          label: wr.nonProjectHours,
          value: summary.unallocatedHours.toFixed(2),
        },
        ...(includeCost && summary.unallocatedCost
          ? [
              {
                label: wr.unallocatedCost,
                value: formatMoney(summary.unallocatedCost, ctx.locale),
                nature: 'actual' as const,
              },
            ]
          : []),
        {
          label: wr.pendingApproval,
          value: String(summary.pendingApprovalCount),
        },
      ],
      tables:
        allocationRows.length > 0
          ? [
              {
                headers: [table.project, table.days, table.hours, table.cost],
                rows: allocationRows,
              },
            ]
          : undefined,
      paragraphs:
        row.missingCount > 0
          ? [wr.missingAttendanceDays.replace('{count}', String(row.missingCount))]
          : undefined,
    });
  }

  return {
    kind: 'monthly_workforce_report',
    title: reportTitle(ctx.copy, 'monthly_workforce_report'),
    generatedAt: ctx.generatedAt.toISOString(),
    locale: resolveReportLocale(ctx.locale),
    dir: reportDirection(ctx.locale),
    identity: {
      companyName: ctx.companyName,
      projectId: null,
      projectName: null,
      projectNumber: null,
      clientName: null,
      extra: yearMonth,
    },
    notices: [ctx.copy.workforceReport.notice.replace('{yearMonth}', yearMonth)],
    sections: [
      {
        id: 'summary',
        heading: ctx.copy.workforceReport.monthSummary,
        rows: [
          {
            label: ctx.copy.workforceReport.reportMonth,
            value: yearMonth,
          },
          {
            label: ctx.copy.workforceReport.employees,
            value: String(employeeSections.length),
          },
          {
            label: ctx.copy.workforceReport.dateRange,
            value: `${fromDate} – ${toDate}`,
          },
        ],
      },
      ...employeeSections,
    ],
    omitted: includeCost ? {} : { compensation: true },
  };
}
