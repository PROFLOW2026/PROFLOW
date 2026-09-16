'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export function MonthlyWorkforceReportMonthForm({
  defaultMonth,
  selectedMonth,
}: {
  readonly defaultMonth: string;
  readonly selectedMonth: string;
}) {
  const t = useTranslations('workforce.reports.monthly');
  const router = useRouter();

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const month = new FormData(form).get('month');
        if (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
          router.push(`/workforce/reports/monthly?month=${month}`);
        }
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('monthLabel')}</span>
        <input
          name="month"
          type="month"
          defaultValue={selectedMonth}
          className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2"
        />
      </label>
      <Button type="submit" variant="secondary" size="sm">
        {t('loadMonth')}
      </Button>
      {selectedMonth !== defaultMonth ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/workforce/reports/monthly?month=${defaultMonth}`)}
        >
          {t('latestCompleted')}
        </Button>
      ) : null}
    </form>
  );
}
