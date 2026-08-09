'use client';

import { useLocale, useTranslations } from 'next-intl';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Link } from '@/shared/i18n/navigation';
import { formatInstant } from '@/shared/dates/format';
import type { AuditEventSummary } from '../_lib/audit';

function translateAuditKey(
  t: ReturnType<typeof useTranslations<'settings.activity'>>,
  group: 'actions' | 'entities',
  value: string,
): string {
  const segments = value.split('.');
  if (segments.length === 2) {
    const nestedKey = `${group}.${segments[0]}.${segments[1]}`;
    if (t.has(nestedKey)) return t(nestedKey);
  }

  const flatKey = `${group}.${value}`;
  if (t.has(flatKey)) return t(flatKey);

  return t(`${group}._fallback`, { value });
}

export function ActivityLogPanel({
  items,
  nextCursor,
  timezone,
}: {
  items: readonly AuditEventSummary[];
  nextCursor: string | null;
  timezone: string;
}) {
  const t = useTranslations('settings.activity');
  const locale = useLocale();

  if (items.length === 0) {
    return <EmptyState title={t('empty')} description={t('subtitle')} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>

      <ResponsiveTable
        items={items}
        getRowKey={(event) => event.id}
        desktop={
          <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columnWhen')}</TableHead>
                  <TableHead>{t('columnWho')}</TableHead>
                  <TableHead>{t('columnAction')}</TableHead>
                  <TableHead>{t('columnEntity')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <span dir="ltr" className="pf-numeric">
                        {formatInstant(event.createdAt, locale, timezone)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {event.actorDisplayName ??
                        (event.actorEmail ? <span dir="ltr">{event.actorEmail}</span> : '—')}
                    </TableCell>
                    <TableCell>{translateAuditKey(t, 'actions', event.action)}</TableCell>
                    <TableCell>{translateAuditKey(t, 'entities', event.entityType)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        }
        renderMobileCard={(event) => (
          <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
            <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
              {formatInstant(event.createdAt, locale, timezone)}
            </p>
            <p className="mt-1 font-medium">
              {event.actorDisplayName ??
                (event.actorEmail ? <span dir="ltr">{event.actorEmail}</span> : '—')}
            </p>
            <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
              {translateAuditKey(t, 'actions', event.action)} ·{' '}
              {translateAuditKey(t, 'entities', event.entityType)}
            </p>
          </div>
        )}
      />

      {nextCursor ? (
        <Link
          href={`/settings/activity?cursor=${encodeURIComponent(nextCursor)}`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--pf-text-brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
        >
          {t('loadMore')}
        </Link>
      ) : null}
    </div>
  );
}
