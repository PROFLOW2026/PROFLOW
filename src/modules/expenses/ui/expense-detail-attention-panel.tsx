'use client';

import { useTranslations } from 'next-intl';
import type { ExpenseAttentionRequired } from '../domain/expense-attention';

export interface ExpenseDetailAttentionPanelProps {
  readonly attention: ExpenseAttentionRequired;
}

export function ExpenseDetailAttentionPanel({ attention }: ExpenseDetailAttentionPanelProps) {
  const t = useTranslations('expenses');

  return (
    <div
      id="expense-detail-attention"
      role="status"
      className="scroll-mt-24 rounded-lg border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] px-4 py-3 text-sm text-[var(--pf-status-warning-fg)]"
    >
      <p className="font-semibold text-[var(--pf-status-warning-fg)]">
        {t(`detail.attention.${attention}.title`)}
      </p>
      <p className="mt-2 text-[var(--pf-status-warning-fg)]/90">
        {t(`detail.attention.${attention}.explain`)}
      </p>
      <p className="mt-2 text-[var(--pf-status-warning-fg)]">
        <span className="font-medium">{t('detail.attention.actionLabel')}: </span>
        {t(`detail.attention.${attention}.action`)}
      </p>
    </div>
  );
}
