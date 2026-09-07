'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ExpenseAttentionRequired } from '../domain/expense-attention';
import { expenseAttentionFocusParam } from '../domain/expense-attention';

const FOCUS_TARGET_IDS = {
  allocation: 'expense-allocation',
  classification: 'expense-category',
  approval: 'expense-finalize-actions',
  payment: 'expense-payment',
} as const;

type ResolveFocusKey = keyof typeof FOCUS_TARGET_IDS;

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

function resolveFocusKey(
  focusParam: string | null,
  attention: ExpenseAttentionRequired | null,
): ResolveFocusKey | null {
  if (
    focusParam === 'allocation' ||
    focusParam === 'classification' ||
    focusParam === 'approval' ||
    focusParam === 'payment'
  ) {
    return focusParam;
  }
  if (!attention) return null;
  return expenseAttentionFocusParam(attention);
}

export interface ExpenseDetailResolveFocusProps {
  readonly attention: ExpenseAttentionRequired | null;
}

/** Scrolls to the resolution section indicated by ?focus= or expense attention. */
export function ExpenseDetailResolveFocus({ attention }: ExpenseDetailResolveFocusProps) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const focusKey = resolveFocusKey(searchParams.get('focus'), attention);
    if (!focusKey) return;

    const target = document.getElementById(FOCUS_TARGET_IDS[focusKey]);
    if (!target) return;

    const timer = window.setTimeout(() => highlightTarget(target), 120);
    return () => window.clearTimeout(timer);
  }, [attention, searchParams]);

  return null;
}
