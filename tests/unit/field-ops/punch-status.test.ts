import { describe, expect, it } from 'vitest';
import {
  assertPunchStatusTransition,
  canTransitionPunchStatus,
  closedAtForPunchStatus,
  isTerminalPunchStatus,
} from '@/modules/field-ops';

describe('canTransitionPunchStatus', () => {
  it('allows open → in_progress / done / cancelled', () => {
    expect(canTransitionPunchStatus('open', 'in_progress')).toBe(true);
    expect(canTransitionPunchStatus('open', 'done')).toBe(true);
    expect(canTransitionPunchStatus('open', 'cancelled')).toBe(true);
  });

  it('allows same-status no-op', () => {
    expect(canTransitionPunchStatus('open', 'open')).toBe(true);
  });

  it('blocks transitions from cancelled', () => {
    expect(canTransitionPunchStatus('cancelled', 'open')).toBe(false);
    expect(canTransitionPunchStatus('cancelled', 'done')).toBe(false);
  });

  it('allows reopen from done to open only', () => {
    expect(canTransitionPunchStatus('done', 'open')).toBe(true);
    expect(canTransitionPunchStatus('done', 'in_progress')).toBe(false);
  });
});

describe('assertPunchStatusTransition', () => {
  it('throws on invalid transition', () => {
    expect(() => assertPunchStatusTransition('cancelled', 'open')).toThrow(/Invalid punch/);
  });
});

describe('isTerminalPunchStatus', () => {
  it('treats done and cancelled as terminal', () => {
    expect(isTerminalPunchStatus('done')).toBe(true);
    expect(isTerminalPunchStatus('cancelled')).toBe(true);
    expect(isTerminalPunchStatus('open')).toBe(false);
  });
});

describe('closedAtForPunchStatus', () => {
  it('sets closedAt only for done', () => {
    const now = new Date('2026-08-09T12:00:00Z');
    expect(closedAtForPunchStatus('done', now)).toEqual(now);
    expect(closedAtForPunchStatus('open', now)).toBeNull();
    expect(closedAtForPunchStatus('cancelled', now)).toBeNull();
  });
});
