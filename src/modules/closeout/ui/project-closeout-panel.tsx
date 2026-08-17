import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { withOrgContext } from '@/shared/auth/session';
import { fromNumericString } from '@/shared/money';
import { getCloseoutWorkspace } from '../application/get-closeout';
import { hasHardBlockers } from '../domain/readiness';
import type {
  CloseoutEventKind,
  CloseoutFinancialSnapshot,
  CloseoutStatus,
  ReadinessItem,
  ReadinessSeverity,
} from '../domain/types';
import { CloseoutActions } from './closeout-forms';
import { PrepareMessageLink } from '@/modules/communications/ui/prepare-message-link';

function lifecycleShape(status: CloseoutStatus | 'none'): StatusShape {
  switch (status) {
    case 'ready':
      return 'pending';
    case 'closed':
      return 'completed';
    case 'reopened':
      return 'onHold';
    case 'open':
      return 'active';
    default:
      return 'draft';
  }
}

function severityShape(severity: ReadinessSeverity): StatusShape {
  if (severity === 'hard') return 'rejected';
  if (severity === 'warning') return 'onHold';
  return 'draft';
}

function SnapshotCard({
  label,
  amount,
  currency,
}: {
  label: string;
  amount: string | null | undefined;
  currency: string;
}) {
  const value = amount ? fromNumericString(amount, currency) : null;
  return (
    <div className="min-w-0">
      <p className="text-xs text-[var(--pf-text-muted)]">{label}</p>
      {value ? <MoneyText value={value} /> : <p className="text-sm">—</p>}
    </div>
  );
}

function SnapshotGrid({
  snapshot,
  canReadProfit,
  t,
}: {
  snapshot: CloseoutFinancialSnapshot;
  canReadProfit: boolean;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const currency = snapshot.currency;
  const hideProfit = snapshot.profitHidden || !canReadProfit;
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <SnapshotCard
        label={t('snapshot.originalContract')}
        amount={snapshot.originalContract?.amount}
        currency={snapshot.originalContract?.currency ?? currency}
      />
      <SnapshotCard
        label={t('snapshot.currentContract')}
        amount={snapshot.currentContract?.amount}
        currency={snapshot.currentContract?.currency ?? currency}
      />
      <SnapshotCard
        label={t('snapshot.approvedChanges')}
        amount={snapshot.approvedChanges?.amount}
        currency={snapshot.approvedChanges?.currency ?? currency}
      />
      <SnapshotCard
        label={t('snapshot.actualCost')}
        amount={snapshot.actualCost.amount}
        currency={snapshot.actualCost.currency}
      />
      <SnapshotCard
        label={t('snapshot.remainingCommitments')}
        amount={snapshot.remainingCommitments.amount}
        currency={snapshot.remainingCommitments.currency}
      />
      <SnapshotCard
        label={t('snapshot.totalBilling')}
        amount={snapshot.totalBilling.amount}
        currency={snapshot.totalBilling.currency}
      />
      <SnapshotCard
        label={t('snapshot.paymentsReceived')}
        amount={snapshot.paymentsReceived.amount}
        currency={snapshot.paymentsReceived.currency}
      />
      <SnapshotCard
        label={t('snapshot.outstandingClient')}
        amount={snapshot.outstandingClient.amount}
        currency={snapshot.outstandingClient.currency}
      />
      <SnapshotCard
        label={t('snapshot.supplierOutstanding')}
        amount={snapshot.supplierOutstanding.amount}
        currency={snapshot.supplierOutstanding.currency}
      />
      <SnapshotCard
        label={t('snapshot.retentionHeld')}
        amount={snapshot.retentionHeld?.amount}
        currency={snapshot.retentionHeld?.currency ?? currency}
      />
      {hideProfit ? (
        <div className="min-w-0 sm:col-span-2">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('snapshot.expectedProfit')}</p>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('snapshot.unavailable')}</p>
        </div>
      ) : (
        <>
          <SnapshotCard
            label={t('snapshot.expectedProfit')}
            amount={snapshot.expectedProfit?.amount}
            currency={snapshot.expectedProfit?.currency ?? currency}
          />
          <div className="min-w-0">
            <p className="text-xs text-[var(--pf-text-muted)]">{t('snapshot.margin')}</p>
            <p className="text-sm">{snapshot.marginPercent ? `${snapshot.marginPercent}%` : '—'}</p>
          </div>
        </>
      )}
    </div>
  );
}

function ReadinessGroup({
  title,
  items,
  empty,
  t,
}: {
  title: string;
  items: readonly ReadinessItem[];
  empty: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.key} className="flex min-w-0 items-center justify-between gap-2">
              <span className="min-w-0 text-sm">{t(`readiness.items.${item.key}`)}</span>
              <StatusBadge shape={severityShape(item.severity)} label={String(item.count)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function ProjectCloseoutPanel({ projectId }: { readonly projectId: string }) {
  const t = await getTranslations('closeout');
  const workspace = await withOrgContext((context) => getCloseoutWorkspace(context, projectId));

  if (!workspace.closeoutEligible) {
    return (
      <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
        <h2 className="text-base font-semibold">{t('title')}</h2>
        <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{t('actions.jobsHint')}</p>
      </section>
    );
  }

  const lifecycle = workspace.closeout?.status ?? 'none';
  const blocked = hasHardBlockers(workspace.items);
  const hard = workspace.items.filter((item) => item.severity === 'hard');
  const warnings = workspace.items.filter((item) => item.severity === 'warning');
  const info = workspace.items.filter((item) => item.severity === 'info');

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{t('title')}</h2>
          <StatusBadge
            shape={lifecycleShape(lifecycle)}
            label={t(`lifecycle.${lifecycle === 'none' ? 'active' : lifecycle}`)}
          />
        </div>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
        <PrepareMessageLink
          entityType="closeout"
          entityId={workspace.closeout?.id}
          projectId={projectId}
        />
      </section>

      {lifecycle === 'none' ? (
        <EmptyState title={t('empty.title')} description={t('empty.body')} />
      ) : null}

      <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
        <h3 className="text-sm font-semibold">{t('readiness.title')}</h3>
        {blocked ? <Alert tone="danger">{t('actions.blocked')}</Alert> : null}
        <ReadinessGroup title={t('readiness.hard')} items={hard} empty={t('readiness.empty')} t={t} />
        <ReadinessGroup title={t('readiness.warning')} items={warnings} empty={t('readiness.empty')} t={t} />
        <ReadinessGroup title={t('readiness.info')} items={info} empty={t('readiness.empty')} t={t} />
      </section>

      {workspace.snapshot ? (
        <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h3 className="text-sm font-semibold">{t('snapshot.title')}</h3>
          <SnapshotGrid
            snapshot={workspace.snapshot}
            canReadProfit={workspace.canReadProfit}
            t={t}
          />
        </section>
      ) : null}

      <CloseoutActions
        projectId={projectId}
        lifecycle={lifecycle}
        canUpdate={workspace.canUpdate}
        hasHardBlockers={blocked}
      />

      <section className="flex min-w-0 flex-col gap-2">
        <h3 className="text-sm font-semibold">{t('history.title')}</h3>
        {workspace.events.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('history.empty')}</p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-2">
            {workspace.events.map((event) => (
              <li
                key={event.id}
                className="rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
              >
                <p className="font-medium">{t(`lifecycle.${eventKindLifecycle(event.eventKind)}`)}</p>
                {event.reason ? <p className="mt-1 text-[var(--pf-text-secondary)]">{event.reason}</p> : null}
                <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
                  {event.actorName ? t('history.actor', { name: event.actorName }) : null}
                  {event.actorName ? ' · ' : null}
                  {t('history.at', { date: event.createdAt.toISOString().slice(0, 10) })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function eventKindLifecycle(kind: CloseoutEventKind): 'active' | 'ready' | 'closed' | 'reopened' {
  switch (kind) {
    case 'marked_ready':
      return 'ready';
    case 'closed':
      return 'closed';
    case 'reopened':
      return 'reopened';
    default:
      return 'active';
  }
}
