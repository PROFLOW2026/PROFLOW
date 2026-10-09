'use client';

import { useTranslations } from 'next-intl';

export function BoardBucketMoveSelect({
  currentBucketId,
  buckets,
  onMove,
}: {
  currentBucketId: string | null;
  buckets: { id: string; label: string }[];
  onMove: (bucketId: string) => void;
}) {
  const t = useTranslations('tasks');
  const valid = buckets.filter((b) => b.id !== currentBucketId && b.id !== '__none__');

  if (valid.length === 0) return null;

  return (
    <label className="mt-1 block min-w-0 max-w-full">
      <span className="sr-only">{t('board.moveToBucket')}</span>
      <select
        aria-label={t('board.moveToBucket')}
        defaultValue=""
        className="h-9 w-full max-w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 text-xs"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const next = event.target.value;
          event.target.value = '';
          if (next) onMove(next);
        }}
      >
        <option value="">{t('board.moveToBucket')}</option>
        {valid.map((target) => (
          <option key={target.id} value={target.id}>
            {target.label}
          </option>
        ))}
      </select>
    </label>
  );
}
