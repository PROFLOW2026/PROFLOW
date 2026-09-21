import { describe, expect, it } from 'vitest';
import { detectCycle } from '@/modules/tasks/domain/dependencies';

describe('detectCycle', () => {
  it('returns false when adding a non-cyclic edge', () => {
    const deps = [
      { sourceTaskId: 'b', targetTaskId: 'a' },
    ];
    expect(detectCycle('c', 'b', deps)).toBe(false);
  });

  it('returns true when adding an edge would close a cycle', () => {
    const deps = [
      { sourceTaskId: 'b', targetTaskId: 'a' },
      { sourceTaskId: 'c', targetTaskId: 'b' },
    ];
    expect(detectCycle('a', 'c', deps)).toBe(true);
  });

  it('returns true for a direct two-node cycle', () => {
    const deps = [{ sourceTaskId: 'b', targetTaskId: 'a' }];
    expect(detectCycle('a', 'b', deps)).toBe(true);
  });

  it('returns false when there are no existing dependencies', () => {
    expect(detectCycle('a', 'b', [])).toBe(false);
  });
});
