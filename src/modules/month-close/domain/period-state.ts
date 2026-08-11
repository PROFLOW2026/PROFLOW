import { DomainRuleError } from '@/shared/errors';
import type { MonthCloseStatus } from './types';

/**
 * Operational close state machine: OPEN → READY → CLOSED.
 * Closed periods are never silently reopened.
 */
export function canTransitionMonthClose(
  from: MonthCloseStatus,
  to: MonthCloseStatus,
): boolean {
  if (from === to) return false;
  if (from === 'open' && to === 'ready') return true;
  if (from === 'ready' && to === 'open') return true; // demote to fix checklist
  if (from === 'ready' && to === 'closed') return true;
  return false;
}

export function assertCanTransitionMonthClose(
  from: MonthCloseStatus,
  to: MonthCloseStatus,
): void {
  if (!canTransitionMonthClose(from, to)) {
    throw new DomainRuleError(
      `Cannot move month close from ${from} to ${to}`,
      'monthClose.errors.invalidTransition',
      { from, to },
    );
  }
}

export function assertPeriodNotClosed(status: MonthCloseStatus): void {
  if (status === 'closed') {
    throw new DomainRuleError(
      'This month is closed — use an explicit post-close adjustment',
      'monthClose.errors.monthClosed',
      { status },
    );
  }
}

export function assertPeriodClosed(status: MonthCloseStatus): void {
  if (status !== 'closed') {
    throw new DomainRuleError(
      'Post-close adjustments require a closed month',
      'monthClose.errors.notClosed',
      { status },
    );
  }
}

export function statusShape(
  status: MonthCloseStatus,
): 'draft' | 'pending' | 'completed' {
  if (status === 'open') return 'draft';
  if (status === 'ready') return 'pending';
  return 'completed';
}
