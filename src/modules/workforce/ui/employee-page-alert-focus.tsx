'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const FOCUS_TARGETS = {
  payroll: 'employee-payroll-payment',
  labor: 'employee-labor-allocation',
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

/** Opens labor allocation details and scrolls to alert resolution targets. */
export function EmployeePageAlertFocus() {
  const searchParams = useSearchParams();
  const focus = searchParams.get('focus');

  useEffect(() => {
    if (focus !== 'labor' && focus !== 'payroll') return;

    const targetId = FOCUS_TARGETS[focus];
    const target = document.getElementById(targetId);
    if (!target) return;

    if (focus === 'labor' && target instanceof HTMLDetailsElement) {
      target.open = true;
    }

    const timer = window.setTimeout(() => highlightTarget(target), 120);
    return () => window.clearTimeout(timer);
  }, [focus]);

  return null;
}
