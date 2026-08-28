'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  expenseAttentionFocusParam,
  type ExpenseAttentionRequired,
} from '../domain/expense-attention';

const FOCUS_TARGET_IDS = {
  allocation: 'expense-allocation',
  classification: 'expense-category',
  approval: 'expense-finalize-actions',
} as const;

function highlightTarget(element: HTMLElement) {
  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  element.classList.add(
    'ring-2',
    'ring-[var(--pf-status-warning-border)]',
    'ring-offset-2',
    'ring-offset-[var(--pf-bg-surface)]',
    'rounded-lg',
  );
  window.setTimeout(() => {
    element.classList.remove(
      'ring-2',
      'ring-[var(--pf-status-warning-border)]',
      'ring-offset-2',
      'ring-offset-[var(--pf-bg-surface)]',
      'rounded-lg',
    );
  }, 2600);
}

export interface ExpenseDetailAttentionFocusProps {
  readonly attention: ExpenseAttentionRequired | null;
}

/** Scrolls to and lightly highlights the section the Owner should fix. */
export function ExpenseDetailAttentionFocus({ attention }: ExpenseDetailAttentionFocusProps) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!attention) return;

    const focusParam = searchParams.get('focus');
    const focusKey =
      focusParam === 'allocation' ||
      focusParam === 'classification' ||
      focusParam === 'approval'
        ? focusParam
        : expenseAttentionFocusParam(attention);

    const targetId = FOCUS_TARGET_IDS[focusKey];
    const target = document.getElementById(targetId);
    if (!target) return;

    const timer = window.setTimeout(() => highlightTarget(target), 120);
    return () => window.clearTimeout(timer);
  }, [attention, searchParams]);

  return null;
}
