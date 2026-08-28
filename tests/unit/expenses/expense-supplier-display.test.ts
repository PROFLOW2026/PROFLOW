import { describe, expect, it } from 'vitest';
import {
  expenseListLabel,
  expenseSupplierDisplay,
} from '@/modules/expenses/ui/expense-list-label';

const t = (key: string) => key;

describe('expenseSupplierDisplay', () => {
  it('prefers linked vendor name over stored supplier name', () => {
    expect(
      expenseSupplierDisplay({
        vendorName: 'Acme Ltd',
        supplierName: 'Free-text supplier',
      }),
    ).toBe('Acme Ltd');
  });

  it('falls back to stored supplier name when no vendor link', () => {
    expect(
      expenseSupplierDisplay({
        vendorName: null,
        supplierName: '  Cash supplier  ',
      }),
    ).toBe('Cash supplier');
  });

  it('shows em dash when supplier is missing', () => {
    expect(
      expenseSupplierDisplay({
        vendorName: null,
        supplierName: null,
      }),
    ).toBe('—');
  });
});

describe('expenseListLabel', () => {
  it('does not use supplier name as description fallback', () => {
    expect(
      expenseListLabel(
        { description: null, supplierName: 'Vendor-only name', voidsExpenseId: null },
        t,
      ),
    ).toBe('list.noDescription');
  });
});
