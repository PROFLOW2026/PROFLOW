import { describe, expect, it } from 'vitest';
import {
  assertWorkPermitStatusTransition,
  canTransitionWorkPermitStatus,
} from '@/modules/work-permits';
import { DomainRuleError } from '@/shared/errors';

describe('canTransitionWorkPermitStatus', () => {
  it('allows draft → submitted → approved', () => {
    expect(canTransitionWorkPermitStatus('draft', 'submitted')).toBe(true);
    expect(canTransitionWorkPermitStatus('submitted', 'approved')).toBe(true);
  });

  it('allows reject from submitted', () => {
    expect(canTransitionWorkPermitStatus('submitted', 'rejected')).toBe(true);
  });

  it('allows same-status no-op', () => {
    expect(canTransitionWorkPermitStatus('draft', 'draft')).toBe(true);
  });

  it('blocks illegal transitions', () => {
    expect(canTransitionWorkPermitStatus('draft', 'approved')).toBe(false);
    expect(canTransitionWorkPermitStatus('rejected', 'submitted')).toBe(false);
  });
});

describe('assertWorkPermitStatusTransition', () => {
  it('throws on illegal transitions', () => {
    expect(() => assertWorkPermitStatusTransition('draft', 'approved')).toThrow(DomainRuleError);
    expect(() => assertWorkPermitStatusTransition('approved', 'submitted')).toThrow(DomainRuleError);
  });

  it('does not throw on legal path', () => {
    expect(() => assertWorkPermitStatusTransition('draft', 'submitted')).not.toThrow();
    expect(() => assertWorkPermitStatusTransition('submitted', 'approved')).not.toThrow();
    expect(() => assertWorkPermitStatusTransition('submitted', 'rejected')).not.toThrow();
  });
});
