'use client';

import { useTranslations } from 'next-intl';
import type { TaskStatus } from './task-api';

export function BoardStatusMoveSelect({
  currentStatus,
  options,
  onMove,
}: {
  currentStatus: TaskStatus;
  options: { status: TaskStatus; label: string }[];
  onMove: (status: TaskStatus) => void;
}) {
  const t = useTranslations('tasks');
  const valid = options.filter((o) => o.status !== currentStatus);

  if (valid.length === 0) return null;

  return (
    <label className="mt-1 block min-w-0 max-w-full">
      <span className="sr-only">{t('board.moveToStatus')}</span>
      <select
        aria-label={t('board.moveToStatus')}
        defaultValue=""
        className="h-9 w-full max-w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 text-xs"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const next = event.target.value as TaskStatus;
          event.target.value = '';
          if (next) onMove(next);
        }}
      >
        <option value="">{t('board.moveToStatus')}</option>
        {valid.map((target) => (
          <option key={target.status} value={target.status}>
            {target.label}
          </option>
        ))}
      </select>
    </label>
  );
}
