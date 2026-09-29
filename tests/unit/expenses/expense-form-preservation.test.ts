import { describe, expect, it } from 'vitest';
import {
  expenseFormValuesFromFormData,
  normalizeExpenseFormError,
} from '@/modules/expenses/ui/expense-form-preservation';

describe('expenseFormValuesFromFormData', () => {
  it('preserves project_multi routing, vendor, allocations, and payment fields', () => {
    const formData = new FormData();
    formData.set('amount', '1500');
    formData.set('currency', 'ILS');
    formData.set('description', 'Owner repro');
    formData.set('expenseDate', '2026-09-29');
    formData.set('supplierName', 'ACME');
    formData.set('vendorId', '11111111-1111-4111-8111-111111111111');
    formData.set('projectId', '');
    formData.set('allocationIntent', 'project_allocate');
    formData.set('costFamily', 'direct_project');
    formData.set('costCategoryId', '');
    formData.set('vatMode', 'zero');
    formData.set('paymentMethod', 'transfer');
    formData.set('paymentTermId', '22222222-2222-4222-8222-222222222222');
    formData.set('dueDate', '2026-10-15');
    formData.set('markPaidOnCreate', 'false');
    formData.set('paidAt', '');
    formData.set('notes', 'keep me');
    formData.set('paymentStructure', 'single');
    formData.set('installmentCount', '1');
    formData.set(
      'allocations',
      JSON.stringify([
        {
          targetType: 'project',
          projectId: '33333333-3333-4333-8333-333333333333',
          method: 'manual_percent',
          percent: '40',
          sortOrder: 0,
        },
        {
          targetType: 'project',
          projectId: '44444444-4444-4444-8444-444444444444',
          method: 'manual_percent',
          percent: '35',
          sortOrder: 1,
        },
        {
          targetType: 'project',
          projectId: '55555555-5555-4555-8555-555555555555',
          method: 'manual_percent',
          percent: '25',
          sortOrder: 2,
        },
      ]),
    );

    const values = expenseFormValuesFromFormData(formData);

    expect(values.amount).toBe('1500');
    expect(values.vendorId).toBe('11111111-1111-4111-8111-111111111111');
    expect(values.allocationIntent).toBe('project_allocate');
    expect(values.projectId).toBe('');
    expect(values.costFamily).toBe('direct_project');
    expect(values.costCategoryId).toBe('');
    expect(values.paymentMethod).toBe('transfer');
    expect(values.paymentTermId).toBe('22222222-2222-4222-8222-222222222222');
    expect(values.dueDate).toBe('2026-10-15');
    expect(values.notes).toBe('keep me');
    expect(values.allocations).toHaveLength(3);
    expect(values.allocations?.[0]?.projectId).toBe('33333333-3333-4333-8333-333333333333');
    expect(values.allocations?.[0]?.percent).toBe('40');
  });
});

describe('normalizeExpenseFormError', () => {
  it('drops empty and em-dash placeholder banners', () => {
    expect(normalizeExpenseFormError(null)).toBeNull();
    expect(normalizeExpenseFormError('   ')).toBeNull();
    expect(normalizeExpenseFormError('—')).toBeNull();
    expect(normalizeExpenseFormError('Real localized error')).toBe('Real localized error');
  });
});
