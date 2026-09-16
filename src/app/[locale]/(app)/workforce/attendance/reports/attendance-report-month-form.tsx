'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { reportPreviewPath } from '@/modules/reports/domain/paths';
import { useRouter } from '@/shared/i18n/navigation';

export function AttendanceReportMonthForm({
  defaultMonth,
}: {
  readonly defaultMonth: string;
}) {
  const t = useTranslations('workforce.attendance.reports');
  const router = useRouter();

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const month = new FormData(form).get('month');
        if (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
          router.push(reportPreviewPath('monthly_workforce_report', month));
        }
      }}
    >
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm sm:flex-none">
        <span>{t('monthLabel')}</span>
        <input
          name="month"
          type="month"
          defaultValue={defaultMonth}
          required
          className="h-11 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3"
        />
      </label>
      <Button type="submit" size="lg">
        {t('showReport')}
      </Button>
    </form>
  );
}
