import { getTranslations } from 'next-intl/server';
import { formatInstant } from '@/shared/dates';
import type { CoordinationEventDetail } from '../domain/types';

interface HistoryEntry {
  readonly id: string;
  readonly at: Date;
  readonly text: string;
  readonly detail: string | null;
  readonly by: string | null;
}

/** Merged, newest-first history of answers, reschedules, overrides and outcomes (all append-only). */
export async function CoordinationHistory({
  detail,
  locale,
  timeZone,
}: {
  detail: CoordinationEventDetail;
  locale: string;
  timeZone: string;
}) {
  const t = await getTranslations('coordination');
  const fmt = (value: Date) => formatInstant(value, locale, timeZone);
  const partyById = new Map(detail.contractors.map((party) => [party.id, party.tradeLabel ?? party.partyName]));

  const entries: HistoryEntry[] = [
    ...detail.responses.map((response) => ({
      id: `r-${response.id}`,
      at: response.createdAt,
      text: t('history.response', {
        party: partyById.get(response.participantId) ?? '',
        status: t(`partyStatus.${response.status}`),
      }),
      detail: response.note,
      by: response.actor.type === 'external' ? t('detail.byContractor') : t('detail.bySiteTeam', { name: response.actor.displayName ?? '' }),
    })),
    ...detail.reschedules.map((row) => ({
      id: `s-${row.id}`,
      at: row.createdAt,
      text: t('history.reschedule', { from: fmt(row.previousStartsAt), to: fmt(row.newStartsAt) }),
      detail: row.reason,
      by: row.actorName ? t('history.by', { name: row.actorName }) : null,
    })),
    ...detail.overrides.map((row) => ({
      id: `o-${row.id}`,
      at: row.createdAt,
      text: t('history.override', { decision: t(`override.${row.decision}`) }),
      detail: row.reason,
      by: row.actorName ? t('history.by', { name: row.actorName }) : null,
    })),
    ...detail.outcomes.map((row) => ({
      id: `x-${row.id}`,
      at: row.createdAt,
      text: t('history.outcome', { outcome: t(`outcomes.${row.outcome}`) }),
      detail: [row.actualStartAt ? fmt(row.actualStartAt) : null, row.note].filter(Boolean).join(' · ') || null,
      by: row.actorName ? t('history.by', { name: row.actorName }) : null,
    })),
  ].sort((left, right) => right.at.getTime() - left.at.getTime());

  if (entries.length === 0) return <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.historyEmpty')}</p>;

  return (
    <ol className="flex flex-col gap-3 border-s border-[var(--pf-border-default)] ps-4">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-[var(--pf-text-primary)]">{entry.text}</span>
          {entry.detail ? <span className="text-sm text-[var(--pf-text-secondary)]">{entry.detail}</span> : null}
          <span className="text-xs text-[var(--pf-text-muted)]">
            {fmt(entry.at)}
            {entry.by ? ` · ${entry.by}` : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}
