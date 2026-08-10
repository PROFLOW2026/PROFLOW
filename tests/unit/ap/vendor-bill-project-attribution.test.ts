import { describe, expect, it } from 'vitest';
import { resolveVendorBillProjectAmounts } from '@/modules/ap/domain/vendor-bill-project-attribution';

describe('resolveVendorBillProjectAmounts', () => {
  it('uses header total when bill has no allocation rows', () => {
    const result = resolveVendorBillProjectAmounts({
      projectId: 'p1',
      currency: 'ILS',
      headerBills: [
        { billId: 'b1', projectId: 'p1', totalAmount: '100', currency: 'ILS' },
      ],
      allocationLines: [],
      billIdsWithAllocations: new Set(),
    });
    expect(result.amounts).toEqual(['100']);
    expect(result.billIds).toEqual(['b1']);
  });

  it('never adds header when allocation rows exist for the bill', () => {
    const result = resolveVendorBillProjectAmounts({
      projectId: 'p1',
      currency: 'ILS',
      headerBills: [
        { billId: 'b1', projectId: 'p1', totalAmount: '100', currency: 'ILS' },
      ],
      allocationLines: [
        { billId: 'b1', projectId: 'p1', amount: '40', currency: 'ILS' },
        { billId: 'b1', projectId: 'p2', amount: '60', currency: 'ILS' },
      ],
      billIdsWithAllocations: new Set(['b1']),
    });
    expect(result.amounts).toEqual(['40']);
    expect(result.billIds).toEqual(['b1']);
  });

  it('attributes allocation lines even when header points elsewhere', () => {
    const result = resolveVendorBillProjectAmounts({
      projectId: 'p2',
      currency: 'ILS',
      headerBills: [
        { billId: 'b1', projectId: 'p1', totalAmount: '100', currency: 'ILS' },
      ],
      allocationLines: [
        { billId: 'b1', projectId: 'p2', amount: '55', currency: 'ILS' },
      ],
      billIdsWithAllocations: new Set(['b1']),
    });
    expect(result.amounts).toEqual(['55']);
  });
});
