import { describe, expect, it } from 'vitest';
import {
  appendDailyLogCorrectionNote,
  assertDailyLogContentMutable,
  assertDailyLogStatusTransition,
  canTransitionDailyLogStatus,
  isDailyLogLocked,
} from '@/modules/field-ops';
import { DomainRuleError } from '@/shared/errors';

describe('daily log lifecycle', () => {
  it('allows draft → submitted / finalized and submitted → finalized', () => {
    expect(canTransitionDailyLogStatus('draft', 'submitted')).toBe(true);
    expect(canTransitionDailyLogStatus('draft', 'finalized')).toBe(true);
    expect(canTransitionDailyLogStatus('submitted', 'finalized')).toBe(true);
    expect(canTransitionDailyLogStatus('draft', 'draft')).toBe(true);
  });

  it('locks finalized logs against revert and content edits', () => {
    expect(isDailyLogLocked('finalized')).toBe(true);
    expect(isDailyLogLocked('draft')).toBe(false);
    expect(canTransitionDailyLogStatus('finalized', 'draft')).toBe(false);
    expect(canTransitionDailyLogStatus('finalized', 'submitted')).toBe(false);
    expect(() => assertDailyLogStatusTransition('finalized', 'draft')).toThrow(DomainRuleError);
    expect(() => assertDailyLogContentMutable('finalized')).toThrow(DomainRuleError);
    expect(() => assertDailyLogContentMutable('submitted')).not.toThrow();
  });

  it('appends a correction note without replacing the original text', () => {
    const at = new Date('2026-08-15T08:00:00.000Z');
    const next = appendDailyLogCorrectionNote('Original manager note', 'Late delivery recorded', at);
    expect(next).toContain('Original manager note');
    expect(next).toContain('Late delivery recorded');
    expect(next).toContain('2026-08-15T08:00:00.000Z');
  });
});
