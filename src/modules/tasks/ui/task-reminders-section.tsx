'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/ui/cn';
import type { TaskReminderType } from '../domain/types';

const REMINDER_TYPES: TaskReminderType[] = ['on_due', 'day_before', 'custom'];

export interface TaskReminderToggle {
  reminderType: TaskReminderType;
  enabled: boolean;
  remindAt?: string;
}

export interface TaskRemindersSectionProps {
  reminders: TaskReminderToggle[];
  hasDueDate: boolean;
  onChange: (value: TaskReminderToggle) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function TaskRemindersSection({
  reminders,
  hasDueDate,
  onChange,
  disabled = false,
  className,
}: TaskRemindersSectionProps) {
  const t = useTranslations('tasks.reminders');
  const [isPending, startTransition] = useTransition();

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
        {t('label')}
      </p>
      {!hasDueDate ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('needsDueDate')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {REMINDER_TYPES.map((reminderType) => {
            const row = reminders.find((item) => item.reminderType === reminderType) ?? {
              reminderType,
              enabled: false,
            };
            return (
              <li
                key={reminderType}
                className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2"
              >
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    disabled={disabled || isPending}
                    onChange={(event) => {
                      startTransition(() => {
                        void onChange({
                          ...row,
                          enabled: event.target.checked,
                        });
                      });
                    }}
                    className="size-4 accent-[var(--pf-action-primary)]"
                  />
                  <span>{t(`type.${reminderType}`)}</span>
                </label>
                {reminderType === 'custom' && row.enabled ? (
                  <input
                    type="datetime-local"
                    value={row.remindAt ?? ''}
                    disabled={disabled || isPending}
                    onChange={(event) => {
                      startTransition(() => {
                        void onChange({
                          ...row,
                          enabled: true,
                          remindAt: event.target.value,
                        });
                      });
                    }}
                    className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-1 text-sm"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
