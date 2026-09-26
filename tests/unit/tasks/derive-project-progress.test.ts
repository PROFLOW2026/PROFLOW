import { describe, expect, it } from 'vitest';
import { deriveProjectProgress } from '@/modules/tasks/domain/derive-project-progress';

describe('deriveProjectProgress', () => {
  it('ignores tasks that do not contribute', () => {
    const result = deriveProjectProgress([
      { status: 'done', contributesToProgress: false, progressWeight: 50 },
      { status: 'todo', contributesToProgress: true, progressWeight: 10 },
    ]);
    expect(result.percent).toBe(0);
    expect(result.contributingCount).toBe(1);
  });

  it('weights done tasks and treats a null weight as 1', () => {
    const result = deriveProjectProgress([
      { status: 'done', contributesToProgress: true, progressWeight: 30 },
      { status: 'todo', contributesToProgress: true, progressWeight: 20 },
      { status: 'done', contributesToProgress: true, progressWeight: null },
    ]);
    expect(result.percent).toBe(60.8);
    expect(result.doneCount).toBe(2);
  });

  it('drops cancelled and archived tasks from the denominator', () => {
    const result = deriveProjectProgress([
      { status: 'done', contributesToProgress: true, progressWeight: 1 },
      { status: 'cancelled', contributesToProgress: true, progressWeight: 99 },
      { status: 'todo', contributesToProgress: true, progressWeight: 1, isArchived: true },
    ]);
    expect(result.percent).toBe(100);
    expect(result.contributingCount).toBe(1);
  });

  it('returns null when nothing contributes', () => {
    expect(deriveProjectProgress([]).percent).toBeNull();
  });
});
