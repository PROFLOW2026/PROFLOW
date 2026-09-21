'use client';

import { useMemo, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/ui/cn';
import type { RecurrencePreset } from '../domain/recurrence-presets';

const PRESET_VALUES: RecurrencePreset[] = [
  'none',
  'daily',
  'weekly',
  'weekdays',
  'monthly',
  'custom',
];

export interface TaskRecurrenceSectionProps {
  preset: RecurrencePreset;
  interval: number;
  onChange: (value: { preset: RecurrencePreset; interval: number }) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function TaskRecurrenceSection({
  preset,
  interval,
  onChange,
  disabled = false,
  className,
}: TaskRecurrenceSectionProps) {
  const t = useTranslations('tasks.recurrence');
  const [isPending, startTransition] = useTransition();

  const options = useMemo(
    () => PRESET_VALUES.map((value) => ({ value, label: t(`preset.${value}`) })),
    [t],
  );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
        {t('label')}
      </p>
      <select
        value={preset}
        disabled={disabled || isPending}
        onChange={(event) => {
          const nextPreset = event.target.value as RecurrencePreset;
          startTransition(() => {
            void onChange({ preset: nextPreset, interval: nextPreset === 'custom' ? interval : 1 });
          });
        }}
        className="block w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {preset === 'custom' ? (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[var(--pf-text-secondary)]">{t('customInterval')}</span>
          <input
            type="number"
            min={1}
            max={365}
            value={interval}
            disabled={disabled || isPending}
            onChange={(event) => {
              const nextInterval = Number.parseInt(event.target.value, 10) || 1;
              startTransition(() => {
                void onChange({ preset: 'custom', interval: nextInterval });
              });
            }}
            className="block w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
          />
        </label>
      ) : null}
      {preset !== 'none' ? (
        <p className="text-xs text-[var(--pf-text-muted)]">{t('hint')}</p>
      ) : null}
    </div>
  );
}
