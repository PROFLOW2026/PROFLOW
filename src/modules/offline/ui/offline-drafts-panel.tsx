'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Link } from '@/shared/i18n/navigation';
import { getDraftQueue } from '../data/draft-queue';
import { getDefaultAttachmentStore } from '../data/attachment-store';
import { mirrorDraftsToLocalStorage } from '../data/queue-index';
import type { DraftKind, OfflineDraftRecord, SyncStatus } from '../domain/types';
import { ConnectivityIndicator } from './connectivity-banner';
import { useOfflineScope } from './use-offline-aware-form-action';

const KIND_ORDER: readonly DraftKind[] = [
  'expense',
  'time_entry',
  'daily_log',
  'punch',
  'inspection',
  'capture',
  'change_request',
];

const STATUS_ORDER: readonly SyncStatus[] = [
  'conflict',
  'rejected',
  'queued',
  'syncing',
  'draft',
  'synced',
];

function summarizePayload(draft: OfflineDraftRecord): string {
  const p = draft.payload;
  if (typeof p.title === 'string' && p.title.trim()) return p.title.trim();
  if (typeof p.summary === 'string' && p.summary.trim()) return p.summary.trim();
  if (typeof p.description === 'string' && p.description.trim()) return p.description.trim();
  if (typeof p.fileName === 'string' && p.fileName.trim()) return p.fileName.trim();
  if (typeof p.amount === 'string' && p.amount.trim()) {
    const currency = typeof p.currency === 'string' ? p.currency : '';
    return `${p.amount} ${currency}`.trim();
  }
  if (typeof p.hours === 'string' && p.hours.trim()) return `${p.hours}h`;
  return draft.localId.slice(0, 8);
}

export function OfflineDraftsPanel({ organizationId }: { organizationId: string }) {
  const t = useTranslations('offline');
  const scope = useOfflineScope();
  const userId = scope?.userId ?? '';
  const [drafts, setDrafts] = useState<OfflineDraftRecord[]>([]);
  const [counts, setCounts] = useState<Record<SyncStatus, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const refresh = useCallback(() => {
    if (!userId) return;
    startTransition(async () => {
      try {
        const queue = getDraftQueue();
        const [rows, nextCounts] = await Promise.all([
          queue.list({ organizationId, userId, pendingOnly: false }),
          queue.countsByStatus({ organizationId, userId }),
        ]);
        setDrafts(rows);
        setCounts(nextCounts);
        mirrorDraftsToLocalStorage(rows);
        setError(null);
      } catch {
        setError(t('errors.loadFailed'));
      }
    });
  }, [organizationId, userId, startTransition, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function resolveConflict(
    localId: string,
    choice: 'keep_local_as_candidate' | 'discard_local',
  ) {
    setBusyId(localId);
    startTransition(async () => {
      try {
        await getDraftQueue().resolveConflict(localId, choice);
        setError(null);
        setSyncSummary(null);
        refresh();
      } catch {
        setError(t('errors.resolveFailed'));
      } finally {
        setBusyId(null);
      }
    });
  }

  function retryFailed(localId: string) {
    if (!userId) return;
    setBusyId(localId);
    startTransition(async () => {
      try {
        await getDraftQueue().retryFailed(localId, { organizationId, userId });
        setError(null);
        setSyncSummary(t('page.retryQueued'));
        refresh();
      } catch {
        setError(t('errors.retryFailed'));
      } finally {
        setBusyId(null);
      }
    });
  }

  function deleteDraft(localId: string) {
    if (!userId) return;
    setBusyId(localId);
    startTransition(async () => {
      try {
        await getDraftQueue().deleteUnsynced(localId, { organizationId, userId });
        await getDefaultAttachmentStore().deleteByDraft(localId);
        setError(null);
        setSyncSummary(t('page.deletedLocal'));
        refresh();
      } catch {
        setError(t('errors.deleteFailed'));
      } finally {
        setBusyId(null);
      }
    });
  }

  function saveEdit(draft: OfflineDraftRecord) {
    if (!userId) return;
    setBusyId(draft.localId);
    startTransition(async () => {
      try {
        const nextPayload = { ...draft.payload };
        if ('title' in nextPayload) nextPayload.title = editText;
        else if ('summary' in nextPayload) nextPayload.summary = editText;
        else if ('description' in nextPayload) nextPayload.description = editText;
        else if ('note' in nextPayload) nextPayload.note = editText;
        else nextPayload.description = editText;

        await getDraftQueue().updateUnsynced(draft.localId, { organizationId, userId }, nextPayload);
        setEditingId(null);
        setError(null);
        setSyncSummary(t('page.editedLocal'));
        refresh();
      } catch {
        setError(t('errors.editFailed'));
      } finally {
        setBusyId(null);
      }
    });
  }

  const pendingDrafts = drafts.filter((d) => d.syncStatus !== 'synced');
  const kindCounts = KIND_ORDER.map((kind) => ({
    kind,
    count: drafts.filter((d) => d.kind === kind && d.syncStatus !== 'synced').length,
  }));
  const failedCount = (counts?.conflict ?? 0) + (counts?.rejected ?? 0);
  const queuedCount = (counts?.queued ?? 0) + (counts?.draft ?? 0) + (counts?.syncing ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ConnectivityIndicator />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={pending}
            disabled={!userId}
            onClick={() => {
              if (!userId) {
                setError(t('errors.missingOrganization'));
                return;
              }
              startTransition(async () => {
                try {
                  const { runQueuedSync } = await import('../data/sync-runner');
                  const { createProductSyncTransport } = await import(
                    '../data/product-sync-transport'
                  );
                  if (typeof navigator !== 'undefined' && !navigator.onLine) {
                    setError(t('errors.syncRequiresOnline'));
                    return;
                  }
                  const result = await runQueuedSync({
                    organizationId,
                    userId,
                    transport: createProductSyncTransport(),
                  });
                  const synced = result.results.filter((r) => r.status === 'synced').length;
                  const rejected = result.results.filter((r) => r.status === 'rejected').length;
                  const conflicted = result.results.filter((r) => r.status === 'conflict').length;
                  setSyncSummary(
                    t('page.syncSummary', { synced, rejected, conflicted, attempted: result.attempted }),
                  );
                  setError(null);
                  refresh();
                } catch {
                  setError(t('errors.syncFailed'));
                }
              });
            }}
          >
            {t('actions.syncNow')}
          </Button>
          <Button type="button" variant="ghost" size="sm" loading={pending} onClick={refresh}>
            {t('actions.refresh')}
          </Button>
        </div>
      </div>

      <p className="text-sm text-[var(--pf-text-secondary)]">{t('page.hint')}</p>

      {counts ? (
        <p className="text-sm text-[var(--pf-text-primary)]" data-pf-sync-visibility="summary">
          {t('page.visibilitySummary', { pending: queuedCount, failed: failedCount })}
        </p>
      ) : null}

      {syncSummary ? (
        <p role="status" className="text-sm text-[var(--pf-text-brand)]">
          {syncSummary}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-[var(--pf-status-danger-fg)]">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kindCounts.map(({ kind, count }) => (
          <Card key={kind} className="p-4">
            <p className="text-sm text-[var(--pf-text-secondary)]">{t(`kinds.${kind}`)}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{count}</p>
          </Card>
        ))}
      </div>

      {counts ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">{t('page.statusHeading')}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {STATUS_ORDER.map((status) => (
              <li key={status} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-[var(--pf-text-secondary)]">{t(`status.${status}`)}</span>
                <span className="font-medium tabular-nums">{counts[status]}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-4">
        <h2 className="text-sm font-semibold">{t('page.listHeading')}</h2>
        {pendingDrafts.length === 0 ? (
          <EmptyState
            size="sm"
            title={t('page.empty')}
            description={t('page.hint')}
            className="mt-2"
            action={
              <Button asChild size="sm">
                <Link href="/expenses/new">{t('page.emptyCta')}</Link>
              </Button>
            }
          />
        ) : (
          <ul className="mt-3 divide-y divide-[var(--pf-border-default)]">
            {pendingDrafts.map((draft) => (
              <li
                key={draft.localId}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t(`kinds.${draft.kind}`)}</p>
                  <p className="truncate text-sm text-[var(--pf-text-primary)]">
                    {summarizePayload(draft)}
                  </p>
                  <p className="text-xs text-[var(--pf-text-secondary)]">
                    {t('page.updated', { when: draft.updatedAt })}
                  </p>
                  {(draft.syncStatus === 'conflict' || draft.syncStatus === 'rejected') &&
                  draft.conflictReason ? (
                    <p className="mt-1 text-xs text-[var(--pf-status-warning-fg)]">
                      {draft.conflictReason}
                    </p>
                  ) : null}

                  {editingId === draft.localId ? (
                    <div className="mt-2 flex flex-col gap-2">
                      <textarea
                        value={editText}
                        onChange={(event) => setEditText(event.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-2 text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending || busyId === draft.localId}
                          onClick={() => saveEdit(draft)}
                        >
                          {t('actions.saveEdit')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setEditingId(null)}
                        >
                          {t('actions.cancelEdit')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {draft.syncStatus === 'conflict' ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={pending || busyId === draft.localId}
                            onClick={() =>
                              resolveConflict(draft.localId, 'keep_local_as_candidate')
                            }
                          >
                            {t('actions.keepLocal')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="dangerGhost"
                            disabled={pending || busyId === draft.localId}
                            onClick={() => resolveConflict(draft.localId, 'discard_local')}
                          >
                            {t('actions.discardLocal')}
                          </Button>
                        </>
                      ) : null}
                      {draft.syncStatus === 'rejected' || draft.syncStatus === 'conflict' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending || busyId === draft.localId}
                          onClick={() => retryFailed(draft.localId)}
                        >
                          {t('actions.retry')}
                        </Button>
                      ) : null}
                      {draft.syncStatus !== 'syncing' ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={pending || busyId === draft.localId}
                            onClick={() => {
                              setEditingId(draft.localId);
                              setEditText(summarizePayload(draft));
                            }}
                          >
                            {t('actions.edit')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="dangerGhost"
                            disabled={pending || busyId === draft.localId}
                            onClick={() => deleteDraft(draft.localId)}
                          >
                            {t('actions.delete')}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
                <span
                  className={
                    draft.syncStatus === 'conflict' || draft.syncStatus === 'rejected'
                      ? 'text-xs font-semibold text-[var(--pf-status-warning-fg)]'
                      : 'text-xs font-medium text-[var(--pf-text-secondary)]'
                  }
                >
                  {t(`status.${draft.syncStatus}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
