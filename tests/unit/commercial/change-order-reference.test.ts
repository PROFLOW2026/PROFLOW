import { describe, expect, it } from 'vitest';

function nextReferenceFromExisting(references: readonly string[]): string {
  let max = 0;
  for (const reference of references) {
    const match = /^CO-(\d+)$/.exec(reference);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1]!, 10));
    }
  }
  return `CO-${String(max + 1).padStart(3, '0')}`;
}

describe('change order reference allocation', () => {
  it('increments from the highest existing CO reference, not row count', () => {
    expect(nextReferenceFromExisting(['CO-001', 'CO-003'])).toBe('CO-004');
  });

  it('starts at CO-001 when no references exist yet', () => {
    expect(nextReferenceFromExisting([])).toBe('CO-001');
  });
});
