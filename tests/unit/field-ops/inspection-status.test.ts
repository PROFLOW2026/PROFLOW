import { describe, expect, it } from 'vitest';
import {
  assertInspectionStatusTransition,
  canTransitionInspectionStatus,
  isCompletedInspectionStatus,
  isTerminalInspectionStatus,
} from '@/modules/field-ops';

describe('canTransitionInspectionStatus', () => {
  it('allows scheduled → in_progress / passed / failed / cancelled', () => {
    expect(canTransitionInspectionStatus('scheduled', 'in_progress')).toBe(true);
    expect(canTransitionInspectionStatus('scheduled', 'passed')).toBe(true);
    expect(canTransitionInspectionStatus('scheduled', 'failed')).toBe(true);
    expect(canTransitionInspectionStatus('scheduled', 'cancelled')).toBe(true);
  });

  it('allows in_progress → completed outcomes', () => {
    expect(canTransitionInspectionStatus('in_progress', 'passed')).toBe(true);
    expect(canTransitionInspectionStatus('in_progress', 'failed')).toBe(true);
    expect(canTransitionInspectionStatus('in_progress', 'scheduled')).toBe(true);
  });

  it('blocks leaving terminal statuses', () => {
    expect(canTransitionInspectionStatus('passed', 'failed')).toBe(false);
    expect(canTransitionInspectionStatus('failed', 'passed')).toBe(false);
    expect(canTransitionInspectionStatus('cancelled', 'scheduled')).toBe(false);
  });
});

describe('assertInspectionStatusTransition', () => {
  it('throws on invalid transition', () => {
    expect(() => assertInspectionStatusTransition('passed', 'scheduled')).toThrow(
      /Invalid inspection/,
    );
  });
});

describe('isTerminalInspectionStatus / isCompletedInspectionStatus', () => {
  it('classifies terminal and completed statuses', () => {
    expect(isTerminalInspectionStatus('passed')).toBe(true);
    expect(isTerminalInspectionStatus('failed')).toBe(true);
    expect(isTerminalInspectionStatus('cancelled')).toBe(true);
    expect(isTerminalInspectionStatus('scheduled')).toBe(false);

    expect(isCompletedInspectionStatus('passed')).toBe(true);
    expect(isCompletedInspectionStatus('failed')).toBe(true);
    expect(isCompletedInspectionStatus('cancelled')).toBe(false);
  });
});
