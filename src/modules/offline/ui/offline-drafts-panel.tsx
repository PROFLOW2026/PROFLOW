'use client';



import { useCallback, useEffect, useState, useTransition } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import { Card } from '@/components/ui/card';

import { EmptyState } from '@/components/ui/empty-state';

import { Link } from '@/shared/i18n/navigation';

import { getDraftQueue } from '../data/draft-queue';

import { mirrorDraftsToLocalStorage } from '../data/queue-index';

import type { DraftKind, OfflineDraftRecord, SyncStatus } from '../domain/types';

import { ConnectivityIndicator } from './connectivity-banner';



const KIND_ORDER: readonly DraftKind[] = [

  'expense',

  'time_entry',

  'change_request',

  'daily_log',

  'capture',

];



const STATUS_ORDER: readonly SyncStatus[] = [

  'conflict',

  'rejected',

  'queued',

  'syncing',

  'draft',

  'synced',

];



export function OfflineDraftsPanel({ organizationId }: { organizationId: string }) {

  const t = useTranslations('offline');

  const [drafts, setDrafts] = useState<OfflineDraftRecord[]>([]);

  const [counts, setCounts] = useState<Record<SyncStatus, number> | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [pending, startTransition] = useTransition();

  const [resolvingId, setResolvingId] = useState<string | null>(null);



  const refresh = useCallback(() => {
    startTransition(async () => {
      try {
        const queue = getDraftQueue();
        const [rows, nextCounts] = await Promise.all([
          queue.list({ organizationId, pendingOnly: false }),
          queue.countsByStatus(organizationId),
        ]);
        setDrafts(rows);
        setCounts(nextCounts);
        mirrorDraftsToLocalStorage(rows);
        setError(null);
      } catch {
        setError(t('errors.loadFailed'));
      }
    });
  }, [organizationId, startTransition, t]);



  useEffect(() => {
    refresh();
  }, [refresh]);



  function resolveConflict(

    localId: string,

    choice: 'keep_local_as_candidate' | 'discard_local',

  ) {

    setResolvingId(localId);

    startTransition(async () => {

      try {

        await getDraftQueue().resolveConflict(localId, choice);

        setError(null);

        refresh();

      } catch {

        setError(t('errors.resolveFailed'));

      } finally {

        setResolvingId(null);

      }

    });

  }



  const pendingDrafts = drafts.filter((d) => d.syncStatus !== 'synced');

  const kindCounts = KIND_ORDER.map((kind) => ({

    kind,

    count: drafts.filter((d) => d.kind === kind && d.syncStatus !== 'synced').length,

  }));



  return (

    <div className="flex flex-col gap-4">

      <div className="flex flex-wrap items-center justify-between gap-2">

        <ConnectivityIndicator />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              startTransition(async () => {
                try {
                  const { runQueuedSync } = await import('../data/sync-runner');
                  const { createProductSyncTransport } = await import('../data/product-sync-transport');
                  if (typeof navigator !== 'undefined' && !navigator.onLine) {
                    setError(t('errors.syncRequiresOnline'));
                    return;
                  }
                  await runQueuedSync({
                    organizationId,
                    transport: createProductSyncTransport(),
                  });
                  setError(null);
                  refresh();
                } catch {
                  setError(t('errors.syncFailed'));
                }
              });
            }}
            disabled={pending}
            className="min-h-11 rounded-md px-3 text-sm font-medium text-[var(--pf-text-brand)] hover:bg-[var(--pf-teal-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)] disabled:opacity-60"
          >
            {t('actions.syncNow')}
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="min-h-11 rounded-md px-3 text-sm font-medium text-[var(--pf-text-brand)] hover:bg-[var(--pf-teal-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)] disabled:opacity-60"
          >
            {t('actions.refresh')}
          </button>
        </div>

      </div>



      <p className="text-sm text-[var(--pf-text-secondary)]">{t('page.hint')}</p>



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

                <div>

                  <p className="text-sm font-medium">{t(`kinds.${draft.kind}`)}</p>

                  <p className="text-xs text-[var(--pf-text-secondary)]">

                    {t('page.updated', { when: draft.updatedAt })}

                  </p>

                  {draft.syncStatus === 'conflict' && draft.conflictReason ? (

                    <p className="mt-1 text-xs text-[var(--pf-status-warning-fg)]">{draft.conflictReason}</p>

                  ) : null}

                  {draft.syncStatus === 'conflict' ? (

                    <div className="mt-2 flex flex-wrap gap-2">

                      <Button

                        type="button"

                        size="sm"

                        variant="secondary"

                        disabled={pending || resolvingId === draft.localId}

                        onClick={() => resolveConflict(draft.localId, 'keep_local_as_candidate')}

                      >

                        {t('actions.keepLocal')}

                      </Button>

                      <Button

                        type="button"

                        size="sm"

                        variant="dangerGhost"

                        disabled={pending || resolvingId === draft.localId}

                        onClick={() => resolveConflict(draft.localId, 'discard_local')}

                      >

                        {t('actions.discardLocal')}

                      </Button>

                    </div>

                  ) : null}

                </div>

                <span

                  className={

                    draft.syncStatus === 'conflict'

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


