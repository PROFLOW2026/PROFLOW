import { describe, expect, it } from 'vitest';
import {
  buildReversalAmounts,
  negateAllocationLines,
  resolveCorrectionOriginalId,
  reversalDescription,
  sumCorrectionChainNet,
  type CorrectionChainEntry,
} from '@/modules/expenses/domain/corrections';
import {
  assertAdjustableOriginal,
  assertReversible,
  assertVoidable,
} from '@/modules/expenses/domain/lifecycle';
import type { ExpenseDetail } from '@/modules/expenses/domain/types';
import { businessDate } from '@/shared/dates';
import { DomainRuleError } from '@/shared/errors';
import { money } from '@/shared/money';

function expense(partial: Partial<ExpenseDetail> = {}): ExpenseDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    expenseDate: businessDate('2026-08-01'),
    description: 'Site labor',
    supplierName: null,
    vendorId: null,
    projectId: '22222222-2222-4222-8222-222222222222',
    projectName: 'Alpha',
    workPackageId: null,
    costFamily: 'direct_project',
    costCategoryId: null,
    grossAmount: money('1170', 'ILS'),
    status: 'finalized',
    voidsExpenseId: null,
    phaseId: null,
    netAmount: money('1000', 'ILS'),
    taxAmount: money('170', 'ILS'),
    taxSnapshot: null,
    finalizedAt: businessDate('2026-08-01'),
    paymentMethod: null,
    notes: null,
    adjustsExpenseId: null,
    isRecurringTemplate: false,
    recurrenceRule: null,
    recurringTemplateId: null,
    createdByUserId: null,
    allocationPeriodStart: null,
    allocationPeriodEnd: null,
    allocationDriverMethod: null,
    allocationScheduleMode: null,
    allocations: [
      {
        targetType: 'project',
        projectId: '22222222-2222-4222-8222-222222222222',
        workPackageId: null,
        costCategoryId: null,
        method: 'manual_amount',
        amount: money('1170', 'ILS'),
        percent: null,
        notes: null,
        sortOrder: 0,
        amountBasis: 'gross',
      },
    ],
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...partial,
  };
}

describe('expense correction domain (D5)', () => {
  it('builds negated net/tax/gross for a reversing entry', () => {
    const amounts = buildReversalAmounts(expense());
    expect(amounts.netAmount).toBe('-1000.000000');
    expect(amounts.taxAmount).toBe('-170.000000');
    expect(amounts.grossAmount).toBe('-1170.000000');
    expect(amounts.taxSnapshot.netAmount).toBe('-1000.000000');
  });

  it('negates allocation line amounts', () => {
    const lines = negateAllocationLines(expense().allocations);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.amount).toBe('-1170.000000');
  });

  it('labels reversal descriptions', () => {
    expect(reversalDescription(expense())).toBe('Reversal: Site labor');
    expect(reversalDescription(expense({ description: null }))).toContain('Reversal of expense');
  });

  it('blocks void when an active reversal exists', () => {
    expect(() => assertVoidable('finalized', null, true)).toThrow(DomainRuleError);
  });

  it('blocks a second reversal', () => {
    expect(() => assertReversible('finalized', null, null, true)).toThrow(DomainRuleError);
  });

  it('blocks adjusting a reversal row', () => {
    expect(() =>
      assertAdjustableOriginal('finalized', '33333333-3333-4333-8333-333333333333'),
    ).toThrow(DomainRuleError);
  });

  it('resolves the original id from reversal and replacement rows', () => {
    const originalId = '11111111-1111-4111-8111-111111111111';
    expect(resolveCorrectionOriginalId({ id: originalId, voidsExpenseId: null, adjustsExpenseId: null })).toBe(
      originalId,
    );
    expect(
      resolveCorrectionOriginalId({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        voidsExpenseId: originalId,
        adjustsExpenseId: null,
      }),
    ).toBe(originalId);
    expect(
      resolveCorrectionOriginalId({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        voidsExpenseId: null,
        adjustsExpenseId: originalId,
      }),
    ).toBe(originalId);
  });

  it('nets 52k original → 50k replacement as +52k -52k +50k', () => {
    const entries: CorrectionChainEntry[] = [
      {
        id: '1',
        role: 'original',
        status: 'finalized',
        description: 'Materials',
        expenseDate: businessDate('2026-08-01'),
        netAmount: money('52000', 'ILS'),
        grossAmount: money('52000', 'ILS'),
      },
      {
        id: '2',
        role: 'reversal',
        status: 'finalized',
        description: 'Reversal',
        expenseDate: businessDate('2026-08-02'),
        netAmount: money('-52000', 'ILS'),
        grossAmount: money('-52000', 'ILS'),
      },
      {
        id: '3',
        role: 'replacement',
        status: 'finalized',
        description: 'Corrected',
        expenseDate: businessDate('2026-08-02'),
        netAmount: money('50000', 'ILS'),
        grossAmount: money('50000', 'ILS'),
      },
    ];
    expect(sumCorrectionChainNet(entries, 'ILS').amount).toBe('50000.000000');
  });

  it('excludes draft replacements from net until finalized', () => {
    const entries: CorrectionChainEntry[] = [
      {
        id: '1',
        role: 'original',
        status: 'finalized',
        description: null,
        expenseDate: businessDate('2026-08-01'),
        netAmount: money('52000', 'ILS'),
        grossAmount: money('52000', 'ILS'),
      },
      {
        id: '2',
        role: 'reversal',
        status: 'finalized',
        description: null,
        expenseDate: businessDate('2026-08-02'),
        netAmount: money('-52000', 'ILS'),
        grossAmount: money('-52000', 'ILS'),
      },
      {
        id: '3',
        role: 'replacement',
        status: 'draft',
        description: null,
        expenseDate: businessDate('2026-08-02'),
        netAmount: money('50000', 'ILS'),
        grossAmount: money('50000', 'ILS'),
      },
    ];
    expect(sumCorrectionChainNet(entries, 'ILS').amount).toBe('0.000000');
  });
});
