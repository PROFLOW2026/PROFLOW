import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { money } from '@/shared/money';
import { resolveAllocationLines, validateAllocationSum } from '@/modules/expenses/domain/allocation';

describe('expense allocation', () => {
  const total = money('1000', 'ILS');

  it('accepts manual amount lines that sum exactly to the total', () => {
    const lines = resolveAllocationLines(total, [
      {
        targetType: 'project',
        projectId: 'p1',
        method: 'manual_amount',
        amount: '600',
        sortOrder: 0,
      },
      {
        targetType: 'project',
        projectId: 'p2',
        method: 'manual_amount',
        amount: '400',
        sortOrder: 1,
      },
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0]!.amount.amount).toBe('600.000000');
    expect(lines[1]!.amount.amount).toBe('400.000000');
  });

  it('resolves percentage lines with rounding residue on the last line', () => {
    const lines = resolveAllocationLines(total, [
      {
        targetType: 'overhead',
        method: 'manual_percent',
        percent: '33.33',
        sortOrder: 0,
      },
      {
        targetType: 'overhead',
        method: 'manual_percent',
        percent: '33.33',
        sortOrder: 1,
      },
      {
        targetType: 'project',
        projectId: 'p1',
        method: 'manual_percent',
        percent: '33.34',
        sortOrder: 2,
      },
    ]);

    validateAllocationSum(
      total,
      lines.map((line) => line.amount),
    );
  });

  it('rejects allocations that do not sum to the expense total', () => {
    expect(() =>
      resolveAllocationLines(total, [
        {
          targetType: 'overhead',
          method: 'manual_amount',
          amount: '500',
          sortOrder: 0,
        },
      ]),
    ).toThrow(DomainRuleError);
  });

  it('supports mixed amount and percent methods', () => {
    const lines = resolveAllocationLines(total, [
      {
        targetType: 'project',
        projectId: 'p1',
        method: 'manual_amount',
        amount: '700',
        sortOrder: 0,
      },
      {
        targetType: 'overhead',
        method: 'manual_percent',
        percent: '30',
        sortOrder: 1,
      },
    ]);

    expect(lines).toHaveLength(2);
    validateAllocationSum(
      total,
      lines.map((line) => line.amount),
    );
  });
});
