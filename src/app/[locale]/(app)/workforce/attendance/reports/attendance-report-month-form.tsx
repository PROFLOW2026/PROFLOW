'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { mainAppFieldSpan } from '@/components/patterns/main-app';
import { MainAppListToolbar } from '@/components/patterns/main-app/main-app-list-toolbar';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { reportPreviewPath } from '@/modules/reports/domain/paths';
import {
  formatYearMonthCompact,
  isYearMonth,
  listMonthSelectOptions,
  parseYearMonth,
  yearMonthFromParts,
} from '@/shared/dates/year-month';
import { useRouter } from '@/shared/i18n/navigation';

function initialParts(defaultMonth: string): { readonly month: number; readonly year: number } {
  const parsed = parseYearMonth(defaultMonth);
  if (parsed) return parsed;
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function AttendanceReportMonthForm({
  defaultMonth,
}: {
  readonly defaultMonth: string;
}) {
  const t = useTranslations('workforce.attendance.reports');
  const router = useRouter();
  const monthOptions = useMemo(() => listMonthSelectOptions(), []);
  const initial = useMemo(() => initialParts(defaultMonth), [defaultMonth]);
  const [month, setMonth] = useState(initial.month);
  const [year, setYear] = useState(initial.year);

  const selectedMonth = useMemo(() => {
    try {
      return yearMonthFromParts(year, month);
    } catch {
      return '';
    }
  }, [month, year]);
  const compactDisplay =
    selectedMonth && isYearMonth(selectedMonth)
      ? formatYearMonthCompact(selectedMonth)
      : '';

  return (
    <form
      className="flex w-full min-w-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (isYearMonth(selectedMonth)) {
          router.push(reportPreviewPath('monthly_workforce_report', selectedMonth));
        }
      }}
    >
      <input type="hidden" name="month" value={selectedMonth} />
      <MainAppListToolbar className="items-end">
        <Field label={t('monthLabel')} className={mainAppFieldSpan.md}>
          {(control) => (
            <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
              <SelectTrigger
                id={control.id}
                aria-describedby={control['aria-describedby']}
                className="h-9 w-full min-w-0 font-mono tabular-nums"
                dir="ltr"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="font-mono tabular-nums"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label={t('yearLabel')} className={mainAppFieldSpan.md}>
          {(control) => (
            <Input
              {...control}
              type="number"
              inputMode="numeric"
              name="year"
              value={Number.isFinite(year) ? year : ''}
              onChange={(event) => {
                const next = Number(event.target.value);
                setYear(Number.isFinite(next) ? next : 0);
              }}
              required
              dir="ltr"
              className="h-9 w-full min-w-0 font-mono tabular-nums"
            />
          )}
        </Field>
        {compactDisplay ? (
          <p
            className="pb-1 font-mono text-sm tabular-nums text-[var(--pf-text-secondary)] sm:pb-2"
            dir="ltr"
            aria-label={t('selectedMonthCompact', { value: compactDisplay })}
          >
            {compactDisplay}
          </p>
        ) : null}
        <Button type="submit" size="sm" disabled={!isYearMonth(selectedMonth)}>
          {t('showReport')}
        </Button>
      </MainAppListToolbar>
    </form>
  );
}
