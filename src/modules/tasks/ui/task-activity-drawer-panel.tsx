'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ActivityExpandClient, type TaskActivityViewRow } from './task-activity-client';
import { loadTaskActivityPanelAction } from './actions';

export function TaskActivityDrawerPanel({ taskId }: { taskId: string }) {
  const t = useTranslations('tasks');
  const [rows, setRows] = useState<TaskActivityViewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadTaskActivityPanelAction(taskId).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setRows([]);
        return;
      }
      setError(null);
      setRows(result.rows);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return (
    <section aria-label={t('activity.sectionLabel')} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-[var(--pf-text-secondary)]">
        {t('activity.sectionLabel')}
      </h3>
      {error ? <p className="text-sm text-[var(--pf-text-danger)]">{error}</p> : null}
      {rows == null ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('activity.empty')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('activity.empty')}</p>
      ) : (
        <ActivityExpandClient
          allEvents={rows}
          compactCount={10}
          showLessLabel={t('activity.showLess')}
          showAllLabel={t('activity.showAll', { count: rows.length })}
        />
      )}
    </section>
  );
}
