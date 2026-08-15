import { describe, expect, it } from 'vitest';
import { suggestProjects } from '@/modules/ocr/domain/project-matching';
import { suggestPurchaseOrders } from '@/modules/ocr/domain/po-matching';
import { suggestSubcontracts } from '@/modules/ocr/domain/agreement-matching';

describe('OCR suggestions', () => {
  it('prefers correction memory then open POs', () => {
    const rows = suggestProjects({
      memoryProjectIds: ['p-mem'],
      openPoProjectIds: ['p-po', 'p-mem'],
      engagementProjectIds: ['p-eng'],
      recentBillProjectIds: ['p-bill'],
      names: { 'p-mem': 'Memory', 'p-po': 'PO', 'p-eng': 'Eng', 'p-bill': 'Bill' },
    });
    expect(rows[0]?.projectId).toBe('p-mem');
    expect(rows.map((row) => row.projectId)).toEqual(['p-mem', 'p-po', 'p-eng', 'p-bill']);
  });

  it('matches PO by order number before vendor-open fallback', () => {
    const hits = suggestPurchaseOrders(
      { vendorId: 'v1', projectId: null, orderNumber: 'PO-9' },
      [
        { id: 'a', vendorId: 'v1', projectId: 'p1', reference: 'PO-9', status: 'issued' },
        { id: 'b', vendorId: 'v1', projectId: 'p2', reference: 'OTHER', status: 'issued' },
      ],
    );
    expect(hits[0]?.strength).toBe('order_number');
    expect(hits[0]?.purchaseOrderId).toBe('a');
  });

  it('requires vendor and project for subcontract suggestions', () => {
    expect(
      suggestSubcontracts(
        { vendorId: null, projectId: 'p1', currency: 'ILS' },
        [
          {
            id: 's1',
            vendorId: 'v1',
            projectId: 'p1',
            title: 'Sub',
            subcontractNumber: 'S-1',
            currency: 'ILS',
            status: 'active',
          },
        ],
      ),
    ).toEqual([]);
  });
});
