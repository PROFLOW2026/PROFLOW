'use client';

import { useTranslations } from 'next-intl';
import type { DefectCycleRecordView } from '../domain/types';

export function DefectCycleHistory({ records }: { readonly records: readonly DefectCycleRecordView[] }) {
  const t = useTranslations('defects');
  if (records.length === 0) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('history.empty')}</p>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {records.map((record) => (
        <li key={record.id} className="rounded-md border border-[var(--pf-border-subtle)] px-3 py-2 text-sm">
          <p className="font-medium">
            {t(`recordKind.${record.kind}`)}
            <span className="ms-2 text-xs font-normal text-[var(--pf-text-secondary)]">
              {t('history.cycle', { n: record.cycleNo })}
            </span>
          </p>
          {record.note ? <p className="mt-1 whitespace-pre-wrap text-[var(--pf-text-secondary)]">{record.note}</p> : null}
          <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
            {record.actorName
              ? t('history.by', {
                  name:
                    record.actorType === 'external'
                      ? `${record.actorName} (${t('history.contractor')})`
                      : record.actorName,
                })
              : record.actorType === 'system'
                ? t('history.system')
                : t('history.internal')}
          </p>
        </li>
      ))}
    </ol>
  );
}
