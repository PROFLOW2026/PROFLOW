import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { humanizeEventType } from '../domain/activity';
import { resolveDomainEventTypeForLabel } from '../domain/activity-event-label';
import type { ActivityFeedPage } from '../application/activity-feed';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';
import { Link } from '@/shared/i18n/navigation';

export async function ActivityFeedPanel({
  page,
  title,
  empty,
  financialRedacted,
}: {
  readonly page: ActivityFeedPage;
  readonly title: string;
  readonly empty: string;
  readonly financialRedacted: string;
}) {
  const locale = await getLocale();
  const t = await getTranslations('collaboration');
  const tSettingsActivity = await getTranslations('settings.activity');
  const dt = intlDateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  if (page.items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--pf-text-secondary)]">{empty}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {page.items.map((item) => {
            const actorName =
              item.actor.id && page.actorNames[item.actor.id]
                ? page.actorNames[item.actor.id]
                : null;
            const message = item.redacted
              ? financialRedacted
              : item.messageKey === 'activity.events.generic'
                ? t('activity.events.generic', {
                    type: humanizeEventType(resolveDomainEventTypeForLabel(item.eventType)),
                  })
                : item.messageCatalog === 'settings.activity'
                  ? tSettingsActivity(item.messageKey as 'actions.subcontract_claim.submitted')
                  : t(item.messageKey as 'activity.events.task_external_assigned', {
                      title: item.title ?? '',
                      outcome: item.detail?.outcome ?? '',
                      from: item.detail?.fromStatus ?? '',
                      to: item.detail?.toStatus ?? '',
                    });
            const inner = (
              <div className="flex min-w-0 flex-col gap-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <time dateTime={item.occurredAt} className="text-xs text-[var(--pf-text-muted)]">
                    {dt.format(new Date(item.occurredAt))}
                  </time>
                  {item.redacted ? <Badge tone="neutral">{t('activity.financialBadge')}</Badge> : null}
                  {actorName ? <span className="text-xs text-[var(--pf-text-secondary)]">{actorName}</span> : null}
                </div>
                <p className="break-words">{message}</p>
                {!item.redacted && item.title ? (
                  <p className="text-xs text-[var(--pf-text-secondary)]">{item.title}</p>
                ) : null}
              </div>
            );
            return (
              <li key={item.id} className="border-b border-[var(--pf-border-subtle)] pb-3 last:border-0 last:pb-0">
                {item.href && !item.redacted ? (
                  <Link href={item.href} className="block rounded-md hover:bg-[var(--pf-surface-hover)]">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
