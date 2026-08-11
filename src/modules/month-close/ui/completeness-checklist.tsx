'use client';

import { useTranslations } from 'next-intl';
import type { CompletenessSnapshot } from '../domain/types';

export function CompletenessChecklist({
  snapshot,
}: {
  readonly snapshot: CompletenessSnapshot | null;
}) {
  const t = useTranslations('monthClose');

  if (!snapshot) {
    return (
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('completeness.empty')}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-[var(--pf-text-primary)]">
          {t('completeness.percent', { percent: snapshot.percent })}
        </p>
        <p className="text-xs text-[var(--pf-text-muted)]">
          {t('completeness.passed', {
            passed: snapshot.passedCount,
            applicable: snapshot.applicableCount,
          })}
        </p>
      </div>

      <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-[var(--pf-border-default)]">
        {snapshot.items.map((item) => {
          const label = t(`checks.${item.key}` as never);
          const state = !item.applicable
            ? 'na'
            : item.issueCount === 0
              ? 'ok'
              : 'issue';
          return (
            <li
              key={item.key}
              className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm text-[var(--pf-text-primary)]">{label}</p>
                {state === 'issue' ? (
                  <p className="text-xs text-[var(--pf-text-secondary)]">
                    {t('completeness.issueCount', { count: item.issueCount })}
                  </p>
                ) : null}
              </div>
              <span
                className={
                  state === 'ok'
                    ? 'text-xs font-medium text-[var(--pf-status-success-fg)]'
                    : state === 'issue'
                      ? 'text-xs font-medium text-[var(--pf-status-danger-fg)]'
                      : 'text-xs text-[var(--pf-text-muted)]'
                }
              >
                {state === 'ok'
                  ? t('completeness.stateOk')
                  : state === 'issue'
                    ? t('completeness.stateIssue')
                    : t('completeness.stateNa')}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
