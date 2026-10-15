'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { TaskLinkSummary } from '../domain/types';

export interface BusinessLinkTaskFormProps {
  taskOptions: readonly TaskLinkSummary[];
  hiddenFields: Record<string, string>;
  linkAction: (
    prev: { error?: string },
    formData: FormData,
  ) => Promise<{ error?: string; success?: boolean }>;
  labelsNamespace: 'quotes' | 'service';
}

export function BusinessLinkTaskForm({
  taskOptions,
  hiddenFields,
  linkAction,
  labelsNamespace,
}: BusinessLinkTaskFormProps) {
  const t = useTranslations(labelsNamespace);
  const [state, action, pending] = useActionState(linkAction, {});

  const pickerLabel = t('linkedTasks.taskPickerLabel');

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Field label={pickerLabel} className="min-w-0 flex-1">
        {(control) => (
          <select
            id={control.id}
            name="taskId"
            required
            disabled={taskOptions.length === 0 || pending}
            aria-describedby={control['aria-describedby']}
            className="w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-2 text-sm"
          >
            <option value="">
              {taskOptions.length === 0
                ? t('linkedTasks.noTasksAvailable')
                : t('linkedTasks.taskPickerPlaceholder')}
            </option>
            {taskOptions.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Button
        type="submit"
        variant="secondary"
        size="md"
        disabled={pending || taskOptions.length === 0}
      >
        {t('linkedTasks.linkButton')}
      </Button>
      {state.error ? (
        <p role="alert" className="w-full text-sm text-[var(--pf-status-danger-fg)]">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
