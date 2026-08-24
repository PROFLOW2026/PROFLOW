import { describe, expect, it } from 'vitest';
import {
  canTransitionMonthClose,
  assertCanTransitionMonthClose,
} from '@/modules/month-close/domain/period-state';
import { DomainRuleError } from '@/shared/errors';

/**
 * Model A (canonical, documented in 0069 general_cost_month_frozen_guard):
 * - Month close: OPEN → READY → CLOSED; closed periods never reopen.
 * - Post-close corrections use month_close_adjustments only (no source rewrites).
 * - General cost pool rows stay frozen forever after month close.
 */
describe('Model A — month close period state machine', () => {
  it('never allows closed → open or closed → ready', () => {
    expect(canTransitionMonthClose('closed', 'open')).toBe(false);
    expect(canTransitionMonthClose('closed', 'ready')).toBe(false);
    expect(canTransitionMonthClose('closed', 'closed')).toBe(false);
  });

  it('allows ready → open demotion to fix checklist before close', () => {
    expect(canTransitionMonthClose('ready', 'open')).toBe(true);
  });

  it('allows forward path open → ready → closed', () => {
    expect(canTransitionMonthClose('open', 'ready')).toBe(true);
    expect(canTransitionMonthClose('ready', 'closed')).toBe(true);
  });

  it('forbids skipping ready (open → closed)', () => {
    expect(canTransitionMonthClose('open', 'closed')).toBe(false);
  });

  it('assertCanTransitionMonthClose throws DomainRuleError on closed → open', () => {
    expect(() => assertCanTransitionMonthClose('closed', 'open')).toThrow(DomainRuleError);
    try {
      assertCanTransitionMonthClose('closed', 'open');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe('monthClose.errors.invalidTransition');
    }
  });
});
