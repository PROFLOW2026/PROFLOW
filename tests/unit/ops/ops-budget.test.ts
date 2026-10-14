import { describe, expect, it } from 'vitest';
import {
  dgEventsBudgetMs,
  remainingOpsBudgetMs,
  rotatedOrgOrder,
  shouldSkipOpsJobForBudget,
} from '@/modules/ops/application/ops-worker-budget';

describe('ops worker budget helpers', () => {
  it('returns zero remaining when the safe budget is exhausted', () => {
    const started = 1_000;
    expect(remainingOpsBudgetMs(started, started + 280_000)).toBe(0);
  });

  it('skips jobs when less than five seconds remain', () => {
    expect(shouldSkipOpsJobForBudget(4_999)).toBe(true);
    expect(shouldSkipOpsJobForBudget(5_000)).toBe(false);
  });

  it('caps DG budget by remaining time', () => {
    expect(dgEventsBudgetMs(10_000)).toBe(10_000);
    expect(dgEventsBudgetMs(120_000)).toBe(45_000);
  });

  it('rotates org order by day', () => {
    const orgs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const day1 = rotatedOrgOrder(orgs, 10);
    const day2 = rotatedOrgOrder(orgs, 11);
    expect(day1).not.toEqual(day2);
    expect(day1.map((row) => row.id).sort()).toEqual(['a', 'b', 'c']);
  });
});
