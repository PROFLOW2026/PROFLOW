'use client';

import { Loader2, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  addLabelAction,
  listOrgTaskLabelsAction,
  removeLabelAction,
} from '@/app/[locale]/(app)/work/actions';

export interface TaskLabelAssignmentUi {
  readonly id: string;
  readonly name: string;
  readonly color?: string | null;
}

interface TaskLabelsSectionProps {
  readonly taskId: string;
  readonly assignments: readonly TaskLabelAssignmentUi[];
  readonly disabled?: boolean;
  readonly onRefresh: () => void | Promise<void>;
}

export function TaskLabelsSection({
  taskId,
  assignments,
  disabled = false,
  onRefresh,
}: TaskLabelsSectionProps) {
  const t = useTranslations('tasks');
  const [isPending, startTransition] = useTransition();
  const [orgLabels, setOrgLabels] = useState<
    readonly { id: string; name: string; color: string | null }[]
  >([]);
  const [loadingLabels, setLoadingLabels] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listOrgTaskLabelsAction();
        if (!cancelled) setOrgLabels(rows);
      } finally {
        if (!cancelled) setLoadingLabels(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const assignedIds = useMemo(() => new Set(assignments.map((row) => row.id)), [assignments]);

  const availableToAdd = useMemo(
    () => orgLabels.filter((label) => !assignedIds.has(label.id)),
    [orgLabels, assignedIds],
  );

  const run = (action: () => Promise<{ error?: string }>) => {
    startTransition(() => {
      void (async () => {
        setError(null);
        const result = await action();
        if (result.error) {
          setError(result.error);
          return;
        }
        setPickerOpen(false);
        await onRefresh();
      })();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
        {t('labelsLabel')}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {assignments.map((label) => (
          <Badge key={label.id} tone="brand" className="text-xs">
            {label.name}
            <button
              type="button"
              disabled={disabled || isPending}
              onClick={() => run(() => removeLabelAction(taskId, label.id))}
              aria-label={t('removeLabel', { label: label.name })}
              className="ms-0.5 disabled:opacity-50"
            >
              <X className="size-2.5" aria-hidden />
            </button>
          </Badge>
        ))}

        <button
          type="button"
          disabled={disabled || isPending || loadingLabels}
          onClick={() => setPickerOpen((open) => !open)}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--pf-border-default)] px-2 py-0.5 text-xs text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)] disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-3" aria-hidden />
          )}
          {t('labelsSection.add')}
        </button>
      </div>

      {pickerOpen ? (
        <div className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] p-2">
          {loadingLabels ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('loadingTask')}</p>
          ) : availableToAdd.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('labelsSection.noneAvailable')}</p>
          ) : (
            <ul className="max-h-36 space-y-1 overflow-y-auto">
              {availableToAdd.map((label) => (
                <li key={label.id}>
                  <button
                    type="button"
                    disabled={disabled || isPending}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-start text-sm hover:bg-[var(--pf-bg-muted)]"
                    onClick={() => run(() => addLabelAction(taskId, label.id))}
                  >
                    <span>{label.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {error ? <p className="text-sm text-[var(--pf-status-danger-fg)]">{error}</p> : null}
    </div>
  );
}
