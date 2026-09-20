'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { addDays, businessDate, type BusinessDate } from '@/shared/dates';
import { employeePostponeTaskAction } from '@/app/[locale]/employee/(shell)/tasks/actions';
import { employeeSecondaryButtonClass } from './employee-surface-styles';
import { cn } from '@/shared/ui/cn';

interface EmployeePostponeMenuProps {
  readonly taskId: string;
  readonly dueDate: string | null;
  readonly today: string;
  readonly compact?: boolean;
}

export function EmployeePostponeMenu({ taskId, dueDate, today, compact }: EmployeePostponeMenuProps) {
  const t = useTranslations('employeeApp.filters.postpone');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);
  const [customDate, setCustomDate] = useState(dueDate ?? today);

  function applyDueDate(nextDueDate: string) {
    startTransition(async () => {
      const result = await employeePostponeTaskAction(taskId, nextDueDate);
      if (!result.error) {
        router.refresh();
      }
    });
  }

  function postponeByDays(days: number) {
    const base = dueDate ? businessDate(dueDate) : businessDate(today as BusinessDate);
    applyDueDate(addDays(base, days));
  }

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            className={cn(
              compact ? 'rounded-md px-2 py-1 text-xs' : employeeSecondaryButtonClass,
              'shrink-0',
            )}
            onClick={(event) => event.stopPropagation()}
          >
            {t('action')}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuItem disabled={pending} onSelect={() => postponeByDays(1)}>
            {t('plusOneDay')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pending} onSelect={() => postponeByDays(7)}>
            {t('plusOneWeek')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pending} onSelect={() => setCustomOpen(true)}>
            {t('pickDate')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {customOpen ? (
        <form
          className="absolute z-50 mt-2 min-w-56 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 shadow-md"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!customDate) return;
            applyDueDate(customDate);
            setCustomOpen(false);
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--pf-text-secondary)]">{t('pickDate')}</span>
            <input
              type="date"
              value={customDate}
              onChange={(event) => setCustomDate(event.target.value)}
              lang={locale}
              className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <button type="submit" disabled={pending} className={employeeSecondaryButtonClass}>
              {t('apply')}
            </button>
            <button
              type="button"
              className={employeeSecondaryButtonClass}
              onClick={() => setCustomOpen(false)}
            >
              {t('cancel')}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
