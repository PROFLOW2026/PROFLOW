'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { PendingApprovalItem } from '@/modules/approvals';
import { MoneyText } from '@/components/patterns/money-text';
import { money } from '@/shared/money';
import { Link } from '@/shared/i18n/navigation';
import { decideApprovalAction, type ApprovalsActionState } from './actions';

function formatAge(ageMs: number, t: ReturnType<typeof useTranslations<'approvals'>>): string {
  const hours = Math.floor(ageMs / (60 * 60 * 1000));
  if (hours < 1) return t('age.minutes', { count: Math.max(1, Math.floor(ageMs / 60000)) });
  if (hours < 48) return t('age.hours', { count: hours });
  return t('age.days', { count: Math.floor(hours / 24) });
}

function PendingCard({
  item,
  canDecide,
  entityLabel,
}: {
  item: PendingApprovalItem;
  canDecide: boolean;
  entityLabel: string;
}) {
  const t = useTranslations('approvals');
  const [state, action, pending] = useActionState(decideApprovalAction, {} as ApprovalsActionState);

  return (
    <li className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">{entityLabel}</p>
            <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
              {item.amount && item.currency ? (
                <MoneyText value={money(item.amount, item.currency)} />
              ) : (
                '-'
              )}
            </p>
            <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
              {t('inbox.submitter')}: {item.submitterName ?? t('inbox.unknownSubmitter')}
              {' · '}
              {t('inbox.age')}: {formatAge(item.ageMs, t)}
              {item.totalSteps && item.currentStepOrder
                ? ` · ${t('inbox.step', { current: item.currentStepOrder, total: item.totalSteps })}`
                : null}
            </p>
            {item.sourceHref ? (
              <p className="mt-1 text-sm">
                <Link href={item.sourceHref} className="text-[var(--pf-text-link)] underline">
                  {t('openEntity')}
                </Link>
              </p>
            ) : null}
          </div>
        </div>

        {canDecide ? (
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="requestId" value={item.id} />
            <Textarea
              name="decisionNote"
              placeholder={t('decisionNote')}
              rows={2}
              className="min-h-11"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                name="decision"
                value="approved"
                disabled={pending}
                className="min-h-11 flex-1 sm:flex-none"
              >
                {t('approve')}
              </Button>
              <Button
                type="submit"
                name="decision"
                value="rejected"
                variant="secondary"
                disabled={pending}
                className="min-h-11 flex-1 sm:flex-none"
              >
                {t('reject')}
              </Button>
            </div>
            {state.error ? (
              <Alert tone="danger">{state.error}</Alert>
            ) : null}
            {state.ok ? (
              <Alert tone="success" role="status">
                {t('saved')}
              </Alert>
            ) : null}
          </form>
        ) : null}
      </div>
    </li>
  );
}

export function PendingApprovalsList({
  items,
  canDecide,
}: {
  items: readonly PendingApprovalItem[];
  canDecide: boolean;
}) {
  const t = useTranslations('approvals');

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <PendingCard
          key={item.id}
          item={item}
          canDecide={canDecide}
          entityLabel={t(`entityTypes.${item.entityType}`)}
        />
      ))}
    </ul>
  );
}
