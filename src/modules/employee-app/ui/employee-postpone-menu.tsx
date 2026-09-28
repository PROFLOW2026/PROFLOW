'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  employeePostponeTaskAction,
  type EmployeePostponementOption,
} from '@/app/[locale]/employee/(shell)/tasks/actions';
import { employeeSecondaryButtonClass } from './employee-surface-styles';
import { addDays, businessDate } from '@/shared/dates';
import { cn } from '@/shared/ui/cn';

interface EmployeePostponeMenuProps {
  readonly taskId: string;
  readonly dueDate: string | null;
  readonly today: string;
  readonly compact?: boolean;
}

const OPTIONS: readonly EmployeePostponementOption[] = ['day', 'week', 'month', 'custom'];

export function EmployeePostponeMenu({ taskId, dueDate, today, compact }: EmployeePostponeMenuProps) {
  const t = useTranslations('employeeApp.tasks.postpone');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState<EmployeePostponementOption | null>(null);
  const [customDate, setCustomDate] = useState('');
  const [reason, setReason] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const minCustomDate = addDays(businessDate(today), 1);

  function runPostpone(option: EmployeePostponementOption, nextCustomDate?: string) {
    startTransition(async () => {
      setError(null);
      setSuccessMessage(null);
      const result = await employeePostponeTaskAction(
        taskId,
        option,
        nextCustomDate,
        reason.trim() || undefined,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.successMessage) {
        setSuccessMessage(result.successMessage);
      }
      setOpen(false);
      setSelectedOption(null);
      setCustomDate('');
      setReason('');
      router.refresh();
    });
  }

  function optionLabel(option: EmployeePostponementOption): string {
    switch (option) {
      case 'day':
        return t('optionDay');
      case 'week':
        return t('optionWeek');
      case 'month':
        return t('optionMonth');
      case 'custom':
        return t('optionCustom');
    }
  }

  const canConfirm =
    selectedOption != null &&
    (selectedOption !== 'custom' || /^\d{4}-\d{2}-\d{2}$/.test(customDate.trim()));

  if (compact) {
    return (
      <div className="relative shrink-0" onClick={(event) => event.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-1 text-xs font-medium hover:bg-[var(--pf-bg-muted)]"
            >
              {t('action')}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {OPTIONS.filter((option) => option !== 'custom').map((option) => (
              <DropdownMenuItem
                key={option}
                disabled={pending}
                onSelect={() => runPostpone(option)}
              >
                {optionLabel(option)}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem disabled={pending} onSelect={() => setOpen(true)}>
              {t('optionCustom')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {open ? (
          <form
            className="absolute z-50 mt-2 min-w-56 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 shadow-md end-0"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!customDate.trim()) return;
              runPostpone('custom', customDate.trim());
              setOpen(false);
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--pf-text-secondary)]">
                {t('customDateLabel')}
              </span>
              <input
                type="date"
                value={customDate}
                min={minCustomDate}
                onChange={(event) => setCustomDate(event.target.value)}
                lang={locale}
                className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
              />
            </label>
            <div className="mt-2 flex gap-2">
              <button
                type="submit"
                disabled={pending || !customDate.trim()}
                className="rounded-md border border-[var(--pf-border-default)] px-3 py-1.5 text-sm font-medium"
              >
                {t('confirm')}
              </button>
              <button
                type="button"
                className="rounded-md border border-[var(--pf-border-default)] px-3 py-1.5 text-sm font-medium"
                onClick={() => setOpen(false)}
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        ) : null}
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <button
          type="button"
          disabled={pending}
          className={employeeSecondaryButtonClass}
          onClick={() => {
            setOpen(true);
            setError(null);
            setSuccessMessage(null);
          }}
        >
          {t('action')}
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3">
          <div className="flex flex-wrap gap-2">
            {OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                disabled={pending}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm font-medium',
                  selectedOption === option
                    ? 'border-[var(--pf-primary)] bg-[var(--pf-primary)]/10 text-[var(--pf-primary)]'
                    : 'border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] hover:bg-[var(--pf-bg-muted)]',
                )}
                onClick={() => {
                  setSelectedOption(option);
                  setError(null);
                  if (option === 'custom' && !customDate) {
                    setCustomDate(
                      dueDate && dueDate >= minCustomDate ? dueDate : minCustomDate,
                    );
                  }
                }}
              >
                {optionLabel(option)}
              </button>
            ))}
          </div>

          {selectedOption === 'custom' ? (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--pf-text-secondary)]">
                {t('customDateLabel')}
              </span>
              <input
                type="date"
                value={customDate}
                min={minCustomDate}
                disabled={pending}
                onChange={(event) => setCustomDate(event.target.value)}
                lang={locale}
                className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
              />
            </label>
          ) : null}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--pf-text-secondary)]">
              {t('reasonLabel')}
            </span>
            <textarea
              value={reason}
              disabled={pending}
              rows={2}
              placeholder={t('reasonPlaceholder')}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !canConfirm}
              className={cn(employeeSecondaryButtonClass, 'min-h-9')}
              onClick={() => {
                if (!selectedOption) return;
                runPostpone(
                  selectedOption,
                  selectedOption === 'custom' ? customDate.trim() : undefined,
                );
              }}
            >
              {t('confirm')}
            </button>
            <button
              type="button"
              disabled={pending}
              className="inline-flex min-h-9 items-center rounded-md border border-[var(--pf-border-default)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--pf-bg-muted)]"
              onClick={() => {
                setOpen(false);
                setSelectedOption(null);
                setCustomDate('');
                setReason('');
                setError(null);
              }}
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {successMessage ? (
        <p className="text-sm font-medium text-green-700" role="status">
          {successMessage}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
