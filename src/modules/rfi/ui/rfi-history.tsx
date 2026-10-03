import { getTranslations } from 'next-intl/server';
import { formatInstant } from '@/shared/dates';
import type { RfiHistoryEntry } from '../domain/types';

export async function RfiHistory({
  entries,
  locale,
  timeZone,
}: {
  entries: readonly RfiHistoryEntry[];
  locale: string;
  timeZone: string;
}) {
  const t = await getTranslations('rfi');
  if (entries.length === 0) return null;
  return (
    <ol className="flex flex-col gap-3 border-s-2 border-[var(--pf-border-default)] ps-4">
      {entries.map((entry) => (
        <li key={entry.id} className="text-sm">
          <div className="font-medium text-[var(--pf-text-primary)]">
            {entry.fromStatus
              ? t('history.changed', { from: t(`status.${entry.fromStatus}`), to: t(`status.${entry.toStatus}`) })
              : t('history.created', { status: t(`status.${entry.toStatus}`) })}
          </div>
          <div className="text-[var(--pf-text-secondary)]">
            {formatInstant(entry.createdAt, locale, timeZone)}
            {entry.actorName ? ` · ${entry.actorName}` : null}
          </div>
          {entry.reason ? <p className="mt-1 text-[var(--pf-text-secondary)]">{entry.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}
