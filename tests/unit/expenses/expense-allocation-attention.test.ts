import { describe, expect, it } from 'vitest';
import {
  classifyExpenseCost,
  isAllocatableClassification,
} from '@/modules/expenses/domain/allocation-policy';
import { allocateByProjectWeights } from '@/modules/expenses/domain/allocation';
import { money } from '@/shared/money';

const ILS = 'ILS';

describe('shared vs company-only allocation semantics', () => {
  it('treats business overhead as company-only and shared as allocatable', () => {
    expect(classifyExpenseCost('business_overhead', false)).toBe('OVERHEAD');
    expect(classifyExpenseCost('shared', false)).toBe('SHARED');
    expect(isAllocatableClassification('OVERHEAD')).toBe(true);
    expect(isAllocatableClassification('SHARED')).toBe(true);
    expect(isAllocatableClassification('DIRECT')).toBe(false);
  });

  it('automatic weight allocation splits shared NET across projects', () => {
    const result = allocateByProjectWeights({
      allocatableNet: money('10000', ILS),
      method: 'contract_weight',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      bases: [
        { projectId: 'p1', basisValue: '50000', basisUnit: 'money' },
        { projectId: 'p2', basisValue: '50000', basisUnit: 'money' },
      ],
    });
    expect(result.lines).toHaveLength(2);
    expect(Number(result.lines[0]!.amount.amount)).toBeCloseTo(5000, 2);
    expect(Number(result.lines[1]!.amount.amount)).toBeCloseTo(5000, 2);
  });
});
