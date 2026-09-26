import { describe, expect, it } from 'vitest';
import {
  buildVendorBillCreateHref,
  findExpensesForVendorReference,
  findNonVoidBillsForVendorReference,
  normalizeSupplierReference,
} from '@/modules/expenses/domain/supplier-cost-guidance';

describe('supplier cost guidance', () => {
  it('normalizes invoice references before compare', () => {
    expect(normalizeSupplierReference('  Inv-12   A ')).toBe('inv-12 a');
  });

  it('builds a vendor bill link with vendor and project', () => {
    expect(
      buildVendorBillCreateHref({
        vendorId: 'vendor-1',
        projectId: 'project-1',
      }),
    ).toBe('/procurement/ap/new?vendorId=vendor-1&projectId=project-1');
  });

  it('warns on a non-void bill with the same vendor and reference', () => {
    const hits = findNonVoidBillsForVendorReference(
      { vendorId: 'vendor-1', reference: 'INV-9' },
      [
        { id: 'open', vendorId: 'vendor-1', reference: ' inv-9 ', status: 'open' },
        { id: 'draft', vendorId: 'vendor-1', reference: 'INV-9', status: 'draft' },
        { id: 'voided', vendorId: 'vendor-1', reference: 'INV-9', status: 'void' },
        { id: 'other', vendorId: 'vendor-2', reference: 'INV-9', status: 'open' },
      ],
    );
    expect(hits.map((hit) => hit.id)).toEqual(['open', 'draft']);
  });

  it('matches a finalized expense description to the bill reference', () => {
    const hits = findExpensesForVendorReference(
      { vendorId: 'vendor-1', reference: 'INV-9' },
      [
        { id: 'final', vendorId: 'vendor-1', description: 'INV-9', status: 'finalized' },
        { id: 'draft', vendorId: 'vendor-1', description: 'INV-9', status: 'draft' },
        { id: 'other', vendorId: 'vendor-1', description: 'cement', status: 'finalized' },
      ],
    );
    expect(hits.map((hit) => hit.id)).toEqual(['final']);
  });
});
