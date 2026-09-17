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
  compensationClass: string | undefined,
  employmentBasis: string | null,
): string {
  if (compensationClass === 'owner_manager') {
    return locale.startsWith('he') ? 'בעלים / מנהל (פטור דיווח)' : 'Owner / manager (exempt)';
  }
  if (employmentBasis) {
    return localizeCode(locale, employmentBasis);
  }
  return locale.startsWith('he') ? 'עובד' : 'Employee';
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
    const hourRows: ReportSection['rows'] = summary.canSplitRegularOvertime
      ? [
          {
            label: ctx.locale.startsWith('he') ? 'שעות רגילות' : 'Regular hours',
            value: (summary.approvedRegularHours ?? 0).toFixed(2),
          },
          {
            label: ctx.locale.startsWith('he') ? 'שעות נוספות' : 'Overtime hours',
            value: (summary.approvedOvertimeHours ?? 0).toFixed(2),
          },
          {
            label: ctx.locale.startsWith('he') ? 'סה"כ שעות מאושרות' : 'Total approved hours',
            value: summary.approvedTotalHours.toFixed(2),
          },
        ]
      : [
          {
            label: ctx.locale.startsWith('he') ? 'סה"כ שעות מאושרות' : 'Total approved hours',
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
      employee?.compensationClass,
      employee?.employmentBasis ?? null,
    );

    employeeSections.push({
      id: row.employeeId,
      heading: row.employeeName,
      rows: [
        {
          label: ctx.locale.startsWith('he') ? 'סיווג' : 'Classification',
          value: classification,
        },
        {
          label: ctx.locale.startsWith('he') ? 'ימי עבודה / נוכחות' : 'Workdays',
          value: workdays,
        },
        ...hourRows,
        {
          label: ctx.locale.startsWith('he') ? 'ימים ללא הקצאה' : 'Unallocated days',
          value: String(summary.unallocatedDays),
        },
        {
          label: ctx.locale.startsWith('he') ? 'שעות ללא פרויקט' : 'Non-project hours',
          value: summary.unallocatedHours.toFixed(2),
        },
        ...(includeCost && summary.unallocatedCost
          ? [
              {
                label: ctx.locale.startsWith('he') ? 'עלות ללא הקצאה' : 'Unallocated cost',
                value: formatMoney(summary.unallocatedCost, ctx.locale),
                nature: 'actual' as const,
              },
            ]
          : []),
        {
          label: ctx.locale.startsWith('he') ? 'ממתין לאישור' : 'Pending approval',
          value: String(summary.pendingApprovalCount),
        },
      ],
      tables:
        allocationRows.length > 0
          ? [
              {
                headers: ctx.locale.startsWith('he')
                  ? ['פרויקט', 'ימים', 'שעות', 'עלות']
                  : ['Project', 'Days', 'Hours', 'Cost'],
                rows: allocationRows,
              },
            ]
          : undefined,
      paragraphs:
        row.missingCount > 0
          ? [
              ctx.locale.startsWith('he')
                ? `חסרים ${row.missingCount} ימי דיווח בחודש.`
                : `${row.missingCount} missing attendance day(s) in month.`,
            ]
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
    notices: [
      ctx.locale.startsWith('he')
        ? `דוח עובדים לחודש ${yearMonth}. אין בדוח נתוני שכר / מס — לצרכים תפעוליים בלבד.`
        : `Workforce summary for ${yearMonth}. Not payroll or tax data.`,
    ],
    sections: [
      {
        id: 'summary',
        heading: ctx.locale.startsWith('he') ? 'סיכום חודש' : 'Month summary',
        rows: [
          {
            label: ctx.locale.startsWith('he') ? 'חודש דיווח' : 'Report month',
            value: yearMonth,
          },
          {
            label: ctx.locale.startsWith('he') ? 'עובדים בדוח' : 'Employees',
            value: String(employeeSections.length),
          },
          {
            label: ctx.locale.startsWith('he') ? 'טווח תאריכים' : 'Date range',
            value: `${fromDate} – ${toDate}`,
          },
        ],
      },
      ...employeeSections,
    ],
    omitted: includeCost ? {} : { compensation: true },
  };
}
