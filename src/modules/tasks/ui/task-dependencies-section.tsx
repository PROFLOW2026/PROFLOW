'use client';

import { GitBranch, Loader2, Plus, X } from 'lucide-react';
import { useCallback, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import type { TaskDependencyUi, TaskLinkUi } from './_task-api-stub';

interface TaskDependenciesSectionProps {
  taskId: string;
  dependsOn: TaskDependencyUi[];
  blockedBy: TaskDependencyUi[];
  blocks: TaskDependencyUi[];
  onRefresh: () => void | Promise<void>;
  listPickerOptions: (taskId: string) => Promise<TaskLinkUi[]>;
  onAddDependency: (
    sourceTaskId: string,
    targetTaskId: string,
    dependencyType: 'finish_to_start' | 'blocked_by',
  ) => Promise<{ success?: boolean; error?: string }>;
  onRemoveDependency: (
    sourceTaskId: string,
    targetTaskId: string,
  ) => Promise<{ success?: boolean; error?: string }>;
}

function DependencyList({
  items,
  onRemove,
  removingKey,
}: {
  items: TaskDependencyUi[];
  onRemove?: (item: TaskDependencyUi) => void;
  removingKey: string | null;
}) {
  const t = useTranslations('tasks');

  if (items.length === 0) {
    return <p className="text-sm text-[var(--pf-text-muted)]">{t('dependencies.empty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-2.5 py-1.5"
        >
          <Link
            href={`/tasks/${item.taskId}`}
            className="min-w-0 truncate text-sm font-medium text-[var(--pf-text-brand)] underline-offset-2 hover:underline"
          >
            {item.taskTitle}
          </Link>
          {onRemove ? (
            <button
              type="button"
              onClick={() => onRemove(item)}
              disabled={removingKey === item.id}
              aria-label={t('dependencies.remove', { title: item.taskTitle })}
              className="shrink-0 text-[var(--pf-text-muted)] hover:text-[var(--pf-status-danger-fg)]"
            >
              {removingKey === item.id ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" aria-hidden />
              )}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function TaskDependenciesSection({
  taskId,
  dependsOn,
  blockedBy,
  blocks,
  onRefresh,
  listPickerOptions,
  onAddDependency,
  onRemoveDependency,
}: TaskDependenciesSectionProps) {
  const t = useTranslations('tasks');
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState<'dependsOn' | 'blockedBy' | null>(null);
  const [options, setOptions] = useState<TaskLinkUi[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const rows = await listPickerOptions(taskId);
      setOptions(rows);
    } finally {
      setLoadingOptions(false);
    }
  }, [listPickerOptions, taskId]);

  const openPicker = (mode: 'dependsOn' | 'blockedBy') => {
    if (pickerOpen === mode) {
      setPickerOpen(null);
      return;
    }
    setPickerOpen(mode);
    void loadOptions();
  };

  const handleAdd = (targetTaskId: string, mode: 'finish_to_start' | 'blocked_by') => {
    startTransition(() => {
      void (async () => {
        setError(null);
        const result = await onAddDependency(taskId, targetTaskId, mode);
        if (result.error) {
          setError(result.error);
          return;
        }
        setPickerOpen(null);
        await onRefresh();
      })();
    });
  };

  const handleRemove = (
    item: TaskDependencyUi,
    mode: 'dependsOn' | 'blockedBy' | 'blocks',
  ) => {
    startTransition(() => {
      void (async () => {
        setError(null);
        setRemovingKey(item.id);
        const sourceTaskId = mode === 'blocks' ? item.taskId : taskId;
        const targetTaskId = mode === 'blocks' ? taskId : item.taskId;
        const result = await onRemoveDependency(sourceTaskId, targetTaskId);
        setRemovingKey(null);
        if (result.error) {
          setError(result.error);
          return;
        }
        await onRefresh();
      })();
    });
  };

  const linkedIds = new Set([
    ...dependsOn.map((d) => d.taskId),
    ...blockedBy.map((d) => d.taskId),
    ...blocks.map((d) => d.taskId),
  ]);

  const availableOptions = options.filter((option) => !linkedIds.has(option.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <GitBranch aria-hidden className="size-4 text-[var(--pf-text-muted)]" />
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
          {t('task.dependencies')}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{t('dependencies.dependsOn')}</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--pf-text-brand)]"
              onClick={() => openPicker('dependsOn')}
            >
              <Plus className="size-3" aria-hidden />
              {t('dependencies.add')}
            </button>
          </div>
          <DependencyList
            items={dependsOn}
            removingKey={removingKey}
            onRemove={(item) => handleRemove(item, 'dependsOn')}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{t('task.blockedBy')}</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--pf-text-brand)]"
              onClick={() => openPicker('blockedBy')}
            >
              <Plus className="size-3" aria-hidden />
              {t('dependencies.add')}
            </button>
          </div>
          <DependencyList
            items={blockedBy}
            removingKey={removingKey}
            onRemove={(item) => handleRemove(item, 'blockedBy')}
          />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium">{t('task.blocks')}</p>
          <DependencyList
            items={blocks}
            removingKey={removingKey}
            onRemove={(item) => handleRemove(item, 'blocks')}
          />
        </div>
      </div>

      {pickerOpen ? (
        <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] p-3">
          <p className="text-sm font-medium">
            {pickerOpen === 'dependsOn'
              ? t('dependencies.pickDependsOn')
              : t('dependencies.pickBlockedBy')}
          </p>
          {loadingOptions ? (
            <div className="mt-2 flex justify-center py-2">
              <Loader2 className="size-4 animate-spin text-[var(--pf-text-muted)]" />
            </div>
          ) : availableOptions.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--pf-text-muted)]">{t('dependencies.noOptions')}</p>
          ) : (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {availableOptions.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    disabled={isPending}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-[var(--pf-bg-muted)]"
                    onClick={() =>
                      handleAdd(
                        option.id,
                        pickerOpen === 'blockedBy' ? 'blocked_by' : 'finish_to_start',
                      )
                    }
                  >
                    <span className="min-w-0 truncate">{option.title}</span>
                    <Badge tone="neutral" className="shrink-0 text-[0.625rem]">
                      {t(`status.${option.status}`)}
                    </Badge>
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
