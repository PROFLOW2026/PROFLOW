'use client';

import { mainAppFieldSpan } from '@/components/patterns/main-app';
import { MainAppListToolbar } from '@/components/patterns/main-app/main-app-list-toolbar';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

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
      className="min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const month = new FormData(form).get('month');
        if (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
          router.push(`/workforce/reports/monthly?month=${month}`);
        }
      }}
    >
      <MainAppListToolbar className="items-end">
        <Field label={t('monthLabel')} className={mainAppFieldSpan.md}>
          {(control) => (
            <Input
              {...control}
              name="month"
              type="month"
              defaultValue={selectedMonth}
              dir="ltr"
              className="h-9 w-full min-w-0 font-mono tabular-nums"
            />
          )}
        </Field>
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
      </MainAppListToolbar>
    </form>
  );
}
