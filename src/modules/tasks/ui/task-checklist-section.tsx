'use client';

import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { useCallback, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/ui/cn';
import {
  addChecklistItemAction,
  removeChecklistItemAction,
  reorderChecklistItemAction,
  toggleChecklistItemAction,
} from '@/app/[locale]/(app)/work/actions';

export interface TaskChecklistItemUi {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
  readonly sortKey: string;
}

interface TaskChecklistSectionProps {
  readonly taskId: string;
  readonly items: readonly TaskChecklistItemUi[];
  readonly disabled?: boolean;
  readonly onRefresh: () => void | Promise<void>;
}

export function TaskChecklistSection({
  taskId,
  items,
  disabled = false,
  onRefresh,
}: TaskChecklistSectionProps) {
  const t = useTranslations('tasks');
  const [isPending, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const done = items.filter((item) => item.done).length;

  const run = useCallback(
    (action: () => Promise<{ error?: string; success?: boolean }>) => {
      startTransition(() => {
        void (async () => {
          setError(null);
          const result = await action();
          if (result.error) {
            setError(result.error);
            return;
          }
          await onRefresh();
        })();
      });
    },
    [onRefresh],
  );

  const handleAdd = () => {
    const title = newTitle.trim();
    if (!title) return;
    const formData = new FormData();
    formData.set('title', title);
    run(async () => {
      const result = await addChecklistItemAction(taskId, {}, formData);
      if (result.success) setNewTitle('');
      return result;
    });
  };

  const handleToggle = (itemId: string, checked: boolean) => {
    run(() => toggleChecklistItemAction(itemId, checked));
  };

  const handleRemove = (itemId: string) => {
    run(() => removeChecklistItemAction(itemId));
  };

  const handleReorder = (index: number, direction: 'up' | 'down') => {
    const item = items[index];
    if (!item) return;
    const neighborIndex = direction === 'up' ? index - 1 : index + 1;
    if (neighborIndex < 0 || neighborIndex >= items.length) return;

    const afterSortKey =
      direction === 'up'
        ? neighborIndex > 0
          ? items[neighborIndex - 1]!.sortKey
          : null
        : items[neighborIndex]!.sortKey;
    const beforeSortKey =
      direction === 'up'
        ? items[neighborIndex]!.sortKey
        : (items[neighborIndex + 1]?.sortKey ?? null);

    run(() => reorderChecklistItemAction(item.id, afterSortKey, beforeSortKey));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
          {t('checklist')}
        </p>
        <span className="text-xs text-[var(--pf-text-muted)]">
          {done}/{items.length}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={Math.max(items.length, 1)}
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--pf-bg-muted)]"
      >
        <div
          className="h-full rounded-full bg-[var(--pf-action-primary)] transition-[width]"
          style={{ width: `${items.length > 0 ? (done / items.length) * 100 : 0}%` }}
        />
      </div>

      {items.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`checklist-${item.id}`}
                checked={item.done}
                disabled={disabled || isPending}
                onChange={(event) => handleToggle(item.id, event.target.checked)}
                className="size-4 shrink-0 cursor-pointer rounded border-[var(--pf-border-default)] accent-[var(--pf-action-primary)]"
              />
              <label
                htmlFor={`checklist-${item.id}`}
                className={cn(
                  'min-w-0 flex-1 cursor-pointer text-sm',
                  item.done && 'line-through text-[var(--pf-text-muted)]',
                )}
              >
                {item.title}
              </label>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  disabled={disabled || isPending || index === 0}
                  onClick={() => handleReorder(index, 'up')}
                  aria-label={t('checklistSection.moveUp')}
                  className="rounded p-1 text-[var(--pf-text-muted)] hover:bg-[var(--pf-bg-muted)] disabled:opacity-40"
                >
                  <ChevronUp className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={disabled || isPending || index >= items.length - 1}
                  onClick={() => handleReorder(index, 'down')}
                  aria-label={t('checklistSection.moveDown')}
                  className="rounded p-1 text-[var(--pf-text-muted)] hover:bg-[var(--pf-bg-muted)] disabled:opacity-40"
                >
                  <ChevronDown className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={disabled || isPending}
                  onClick={() => handleRemove(item.id)}
                  aria-label={t('checklistSection.removeItem')}
                  className="rounded p-1 text-[var(--pf-text-muted)] hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-status-danger-fg)]"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newTitle}
          disabled={disabled || isPending}
          onChange={(event) => setNewTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleAdd();
            }
          }}
          placeholder={t('task.addChecklist')}
          className="min-w-0 flex-1 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
        />
        <button
          type="button"
          disabled={disabled || isPending || !newTitle.trim()}
          onClick={handleAdd}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--pf-border-default)] px-2.5 py-1.5 text-sm hover:bg-[var(--pf-bg-muted)] disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-3.5" aria-hidden />
          )}
          {t('task.addChecklist')}
        </button>
      </div>

      {error ? <p className="text-sm text-[var(--pf-status-danger-fg)]">{error}</p> : null}
    </div>
  );
}
