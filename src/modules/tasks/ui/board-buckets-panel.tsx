'use client';

import { ChevronDown, ChevronUp, Loader2, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import type { Bucket } from './task-api';
import {
  createBucketAction,
  reorderBucketsAction,
  updateBucketAction,
} from '@/app/[locale]/(app)/workspaces/actions';

interface BoardBucketsPanelProps {
  readonly boardId: string;
  readonly buckets: readonly Bucket[];
  readonly canManage: boolean;
}

export function BoardBucketsPanel({ boardId, buckets, canManage }: BoardBucketsPanelProps) {
  const t = useTranslations('tasks');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return null;

  const ordered = [...buckets].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const refresh = () => router.refresh();

  const run = (action: () => Promise<{ error?: string; success?: boolean }>) => {
    startTransition(() => {
      void (async () => {
        setError(null);
        const result = await action();
        if (result.error) {
          setError(result.error);
          return;
        }
        refresh();
      })();
    });
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    run(async () => {
      const result = await createBucketAction(boardId, { name });
      if (result.success) setNewName('');
      return result;
    });
  };

  const handleRename = (bucketId: string) => {
    const name = (editing[bucketId] ?? '').trim();
    if (!name) return;
    run(() => updateBucketAction(bucketId, { name }));
  };

  const handleReorder = (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= ordered.length) return;
    const ids = ordered.map((bucket) => bucket.id);
    const tmp = ids[index]!;
    ids[index] = ids[nextIndex]!;
    ids[nextIndex] = tmp;
    run(() => reorderBucketsAction(boardId, ids));
  };

  return (
    <CollapsibleSection title={t('bucketsPanel.title')} summary={t('bucketsPanel.summary')} defaultOpen={false}>
      <ul className="flex flex-col gap-2">
        {ordered.map((bucket, index) => (
          <li
            key={bucket.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-2 py-1.5"
          >
            <input
              type="text"
              value={editing[bucket.id] ?? bucket.name}
              disabled={isPending}
              onChange={(event) =>
                setEditing((prev) => ({ ...prev, [bucket.id]: event.target.value }))
              }
              onBlur={() => {
                const draft = editing[bucket.id];
                if (draft != null && draft.trim() !== bucket.name) handleRename(bucket.id);
              }}
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm focus:border-[var(--pf-border-default)] focus:bg-[var(--pf-bg-surface)]"
            />
            <span className="text-xs text-[var(--pf-text-muted)]">
              {t('bucketsPanel.taskCount', { count: bucket.tasks.length })}
            </span>
            <button
              type="button"
              disabled={isPending || index === 0}
              onClick={() => handleReorder(index, 'up')}
              aria-label={t('checklistSection.moveUp')}
              className="rounded p-1 hover:bg-[var(--pf-bg-muted)] disabled:opacity-40"
            >
              <ChevronUp className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              disabled={isPending || index >= ordered.length - 1}
              onClick={() => handleReorder(index, 'down')}
              aria-label={t('checklistSection.moveDown')}
              className="rounded p-1 hover:bg-[var(--pf-bg-muted)] disabled:opacity-40"
            >
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newName}
          disabled={isPending}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleCreate();
            }
          }}
          placeholder={t('board.addBucket')}
          className="min-w-0 flex-1 rounded-md border border-[var(--pf-border-default)] px-2.5 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={isPending || !newName.trim()}
          onClick={handleCreate}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--pf-border-default)] px-2.5 py-1.5 text-sm hover:bg-[var(--pf-bg-muted)] disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t('board.addBucket')}
        </button>
      </div>

      {error ? <p className="mt-2 text-sm text-[var(--pf-status-danger-fg)]">{error}</p> : null}
    </CollapsibleSection>
  );
}
