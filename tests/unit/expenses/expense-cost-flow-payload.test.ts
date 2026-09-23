import { describe, expect, it } from 'vitest';
import { createExpenseSchema, parseAllocationsFromForm } from '@/modules/expenses/validation/schemas';
import { expensePayloadFromFormData } from '@/modules/offline/domain/payloads';
import { resolveExpenseAllocationIntent } from '@/modules/financials/domain/allocation-intent';
import { resolveAllocationLines } from '@/modules/expenses/domain/allocation';
import { money } from '@/shared/money';

describe('expense cost flow payload and allocation', () => {
  it('CASE 1 bug fix: allocationIntent passes through form payload and schema', () => {
    const formData = new FormData();
    formData.set('amount', '10000');
    formData.set('currency', 'ILS');
    formData.set('allocationIntent', 'company_only');
    formData.set('finalizeOnCreate', 'true');

    const offline = expensePayloadFromFormData(formData);
    expect(offline.allocationIntent).toBe('company_only');

    const parsed = createExpenseSchema.safeParse({
      amount: '10000',
      currency: 'ILS',
      allocationIntent: 'company_only',
      finalizeOnCreate: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.allocationIntent).toBe('company_only');
      expect(parsed.data.finalizeOnCreate).toBe(true);
    }
  });

  it('CASE 4: company_only explicit intent is preserved over inference', () => {
    expect(
      resolveExpenseAllocationIntent({
        explicitIntent: 'company_only',
        projectId: null,
        usesAutomaticDriver: false,
        hasProjectAllocationLine: true,
        hasOverheadAllocationLine: false,
        costFamily: 'business_overhead',
      }),
    ).toBe('company_only');
  });

  it('CASE 5: auto_pool explicit intent is preserved', () => {
    expect(
      resolveExpenseAllocationIntent({
        explicitIntent: 'auto_pool',
        projectId: null,
        usesAutomaticDriver: false,
        hasProjectAllocationLine: true,
        hasOverheadAllocationLine: false,
        costFamily: 'business_overhead',
      }),
    ).toBe('auto_pool');
  });

  it('CASE 2: multi-project NET allocation conserves total', () => {
    const net = money('10000', 'ILS');
    const lines = resolveAllocationLines(net, [
      {
        targetType: 'project',
        projectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        method: 'manual_amount',
        amount: '4000',
        sortOrder: 0,
      },
      {
        targetType: 'project',
        projectId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        method: 'manual_amount',
        amount: '6000',
        sortOrder: 1,
      },
    ]);
    const total = lines.reduce((sum, line) => sum + Number(line.amount.amount), 0);
    expect(total).toBe(10000);
  });

  it('parses allocation JSON with UI lineId and percent lines', () => {
    const formData = new FormData();
    formData.set(
      'allocations',
      JSON.stringify([
        {
          lineId: 'ui-line-1',
          targetType: 'project',
          projectId: 'ee7cb842-bbd1-4188-b95e-9f98446c92aa',
          workPackageId: null,
          costCategoryId: null,
          method: 'manual_percent',
          amount: '',
          percent: '40',
          notes: '',
          sortOrder: 0,
        },
        {
          lineId: 'ui-line-2',
          targetType: 'project',
          projectId: '685e5343-606e-43fb-b5b2-d2b3bc2f9662',
          workPackageId: null,
          costCategoryId: null,
          method: 'manual_percent',
          amount: '',
          percent: '60',
          notes: '',
          sortOrder: 1,
        },
        {
          lineId: 'ui-line-empty',
          targetType: 'project',
          projectId: null,
          method: 'manual_percent',
          amount: '',
          percent: '',
          notes: '',
          sortOrder: 2,
        },
      ]),
    );

    const parsed = parseAllocationsFromForm(formData);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.percent).toBe('40');
    expect(parsed[1]?.percent).toBe('60');
  });

  it('CASE 3: three-way subcontract split conserves NET', () => {
    const net = money('100000', 'ILS');
    const lines = resolveAllocationLines(net, [
      {
        targetType: 'project',
        projectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        method: 'manual_amount',
        amount: '30000',
        sortOrder: 0,
      },
      {
        targetType: 'project',
        projectId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        method: 'manual_amount',
        amount: '50000',
        sortOrder: 1,
      },
      {
        targetType: 'project',
        projectId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        method: 'manual_amount',
        amount: '20000',
        sortOrder: 2,
      },
    ]);
    expect(lines).toHaveLength(3);
    const total = lines.reduce((sum, line) => sum + Number(line.amount.amount), 0);
    expect(total).toBe(100000);
  });
});
