'use client';

import { useLocale, useTranslations } from 'next-intl';
import { resolveIntlLocale } from '@/shared/i18n/intl-locale';
import type { EmployeePendingTimeRow } from '@/modules/employee-app/application/employee-operational';
import {
  ApproveTimesheetButton,
  ReturnTimesheetForm,
} from '@/modules/workforce/ui/timesheet-actions';

export function EmployeePendingTimeApprovalRow({
  row,
  hoursLabel,
}: {
  readonly row: EmployeePendingTimeRow;
  readonly hoursLabel: string;
}) {
  const t = useTranslations('workforce');
  const locale = useLocale();
  const workDateLabel = new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${row.workDate}T00:00:00.000Z`));
  const approvalLabel = t(`time.approvalStatus.${row.approvalStatus}` as 'time.approvalStatus.draft');

  return (
    <li className="space-y-3 px-4 py-3">
      <div className="flex items-start justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="font-medium">
            {row.employeeName} · {workDateLabel}
          </p>
          <p className="text-xs text-[var(--pf-text-secondary)]">{approvalLabel}</p>
        </div>
        <span className="shrink-0 font-medium tabular-nums">{hoursLabel}</span>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <ApproveTimesheetButton
          timeEntryId={row.timesheetId ? undefined : row.id}
          timesheetId={row.timesheetId ?? undefined}
        />
      </div>
      {row.timesheetId ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-[var(--pf-accent)]">
            {t('time.approvals.return')}
          </summary>
          <div className="mt-2">
            <ReturnTimesheetForm timesheetId={row.timesheetId} />
          </div>
        </details>
      ) : null}
    </li>
  );
}
