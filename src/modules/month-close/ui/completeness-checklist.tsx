'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  COMPLETENESS_INFORMATIONAL_CHECK_KEYS,
  type CompletenessCheckItem,
  type CompletenessSnapshot,
} from '../domain/types';

const informationalKeys = new Set<string>(COMPLETENESS_INFORMATIONAL_CHECK_KEYS);

export function CompletenessChecklist({
  snapshot,
}: {
  readonly snapshot: CompletenessSnapshot | null;
}) {
  const t = useTranslations('monthClose');

  const { scoredItems, informationalItems } = useMemo(() => {
    if (!snapshot) {
      return { scoredItems: [], informationalItems: [] };
    }
    const scored: CompletenessCheckItem[] = [];
    const informational: CompletenessCheckItem[] = [];
    for (const item of snapshot.items) {
      if (informationalKeys.has(item.key)) {
        informational.push(item);
      } else {
        scored.push(item);
      }
    }
    return { scoredItems: scored, informationalItems: informational };
  }, [snapshot]);

  if (!snapshot) {
    return (
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('completeness.empty')}</p>
    );
  }

  function renderCheckRow(
    item: CompletenessCheckItem,
    options: { readonly informational?: boolean },
  ) {
    const label = t(`checks.${item.key}` as never);
    const state = !item.applicable
      ? 'na'
      : item.issueCount === 0
        ? 'ok'
        : options.informational
          ? 'info'
          : 'issue';
    return (
      <li
        key={item.key}
        className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <p className="text-sm text-[var(--pf-text-primary)]">{label}</p>
          {options.informational && item.applicable ? (
            <p className="text-xs text-[var(--pf-text-muted)]">
              {t('completeness.ownerDefinedEstimateHint')}
            </p>
          ) : null}
          {state === 'issue' ? (
            <p className="text-xs text-[var(--pf-text-secondary)]">
              {t('completeness.issueCount', { count: item.issueCount })}
            </p>
          ) : null}
          {state === 'info' && item.issueCount > 0 ? (
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
                : state === 'info'
                  ? 'text-xs font-medium text-[var(--pf-text-secondary)]'
                  : 'text-xs text-[var(--pf-text-muted)]'
          }
        >
          {state === 'ok'
            ? t('completeness.stateOk')
            : state === 'issue'
              ? t('completeness.stateIssue')
              : state === 'info'
                ? t('completeness.stateInformational')
                : t('completeness.stateNa')}
        </span>
      </li>
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
        {scoredItems.map((item) => renderCheckRow(item, {}))}
      </ul>

      {informationalItems.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-[var(--pf-text-secondary)]">
            {t('completeness.informationalGroupTitle')}
          </p>
          <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-dashed border-[var(--pf-border-default)]">
            {informationalItems.map((item) => renderCheckRow(item, { informational: true }))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
