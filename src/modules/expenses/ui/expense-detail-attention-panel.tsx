'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  expenseAttentionFocusParam,
  type ExpenseAttentionRequired,
} from '../domain/expense-attention';

const FOCUS_TARGET_IDS = {
  allocation: 'expense-allocation',
  classification: 'expense-category',
  approval: 'expense-finalize-actions',
} as const;

function focusIssue(issue: ExpenseAttentionRequired) {
  const target = document.getElementById(FOCUS_TARGET_IDS[expenseAttentionFocusParam(issue)]);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const control = target.querySelector<HTMLElement>(
    '#expense-category-control, button, a, input, select, textarea',
  );
  control?.focus();
}

export interface ExpenseDetailAttentionPanelProps {
  readonly issues: readonly ExpenseAttentionRequired[];
}

export function ExpenseDetailAttentionPanel({ issues }: ExpenseDetailAttentionPanelProps) {
  const t = useTranslations('expenses');
  if (issues.length === 0) return null;

  return (
    <div
      id="expense-detail-attention"
      role="status"
      className="scroll-mt-24 rounded-lg border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] px-4 py-3 text-sm text-[var(--pf-status-warning-fg)]"
    >
      <p className="font-semibold text-[var(--pf-status-warning-fg)]">
        {issues.length > 1 ? t('detail.attention.issuesTitle') : t(`detail.attention.${issues[0]}.title`)}
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {issues.map((issue) => (
          <li key={issue} className="flex min-w-0 flex-col items-start gap-2">
            {issues.length > 1 ? (
              <p className="font-medium">{t(`detail.attention.${issue}.title`)}</p>
            ) : null}
            <p>{t(`detail.attention.${issue}.explain`)}</p>
            <Button type="button" size="sm" onClick={() => focusIssue(issue)}>
              {issue === 'classification' ? t('attention.chooseCategory') : t('attention.rowAction')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
