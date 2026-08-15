import { Inbox } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Link } from '@/shared/i18n/navigation';
import { pressableCardLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { groupInboxBySeverity } from '../domain/ranking';
import type {
  CommandCenterInbox,
  CommandCenterItem,
  CommandCenterSeverity,
} from '../domain/types';
import { CommandCenterItemActions, type CommandCenterItemActionLabels } from './item-actions';

function severityShape(severity: CommandCenterSeverity): StatusShape {
  switch (severity) {
    case 'critical':
      return 'overdue';
    case 'high':
      return 'onHold';
    case 'medium':
      return 'pending';
    default:
      return 'draft';
  }
}

function InboxItemCard({
  item,
  t,
  actionLabels,
}: {
  readonly item: CommandCenterItem;
  readonly t: Awaited<ReturnType<typeof getTranslations>>;
  readonly actionLabels: CommandCenterItemActionLabels;
}) {
  return (
    <li className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              shape={severityShape(item.severity)}
              label={t(`severity.${item.severity}`)}
            />
            <span className="text-xs text-[var(--pf-text-muted)]">
              {t(`sources.${item.sourceType}`)}
            </span>
          </div>
          <h3 className="mt-2 text-base font-semibold leading-snug">{item.what}</h3>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{item.why}</p>
          <p className="mt-1 text-sm text-[var(--pf-text-muted)]">
            <span className="font-medium text-[var(--pf-text-secondary)]">
              {t('fields.where')}:
            </span>{' '}
            {item.where}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <Link
          href={item.href}
          className={cn(
            pressableCardLinkClassName,
            'inline-flex min-h-11 items-center justify-center px-3 py-2 text-sm font-medium',
          )}
        >
          {t('actions.open')}
        </Link>
      </div>

      <CommandCenterItemActions item={item} labels={actionLabels} />
    </li>
  );
}

export async function TodayInboxPanel({ inbox }: { readonly inbox: CommandCenterInbox }) {
  const t = await getTranslations('commandCenter');
  const actionLabels = {
    handle: t('actions.handle'),
    snooze1d: t('actions.snooze1d'),
    snooze7d: t('actions.snooze7d'),
    financialGuard: t('financialGuard'),
  };

  if (inbox.items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={t('empty.title')}
        description={t('empty.body')}
      />
    );
  }

  const sections = groupInboxBySeverity(inbox.items);

  return (
    <div className="flex flex-col gap-8" aria-label={t('listLabel')}>
      {sections.map((section) => (
        <section key={section.severity} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--pf-text-secondary)]">
            {t(`sections.${section.severity}`)}
          </h2>
          <ul className="flex flex-col gap-3">
            {section.items.map((item) => (
              <InboxItemCard
                key={item.itemKey}
                item={item}
                t={t}
                actionLabels={actionLabels}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
