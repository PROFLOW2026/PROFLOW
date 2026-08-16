import { DomainRuleError } from '@/shared/errors';
import type { MonthCloseStatus } from './types';

/** Postgres trigger error from 0037 when a closed YYYY-MM is rewritten. */
export const CLOSED_PERIOD_FREEZE_CODE = 'closed_period_immutable';

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
      'This month is closed - use an explicit post-close adjustment',
      'monthClose.errors.monthClosed',
      { status },
    );
  }
}

/** Hebrew-mapped: do not rewrite source rows; post a month-close correction. */
export function closedPeriodSourceRewriteError(): DomainRuleError {
  return new DomainRuleError(
    'This month is closed. Record a month-close correction instead of rewriting the source transaction.',
    'monthClose.errors.useCorrectionNotRewrite',
  );
}

export function isClosedPeriodFreezeError(error: unknown): boolean {
  const texts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) {
      texts.push(current.message);
      const code = (current as Error & { code?: string }).code;
      if (code) texts.push(code);
      current = current.cause;
      continue;
    }
    texts.push(String(current));
    break;
  }
  return texts.some(
    (text) =>
      text.includes(CLOSED_PERIOD_FREEZE_CODE) || text.includes('closed_period_immutable'),
  );
}

/** If the DB freeze fired, replace it with the Hebrew DomainRuleError; otherwise rethrow. */
export function rethrowClosedPeriodRewrite(error: unknown): never {
  if (error instanceof DomainRuleError && error.messageKey.startsWith('monthClose.')) {
    throw error;
  }
  if (isClosedPeriodFreezeError(error)) {
    throw closedPeriodSourceRewriteError();
  }
  throw error;
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
