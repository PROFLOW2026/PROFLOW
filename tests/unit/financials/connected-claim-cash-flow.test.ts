import { describe, expect, it } from 'vitest';
import { connectedClaimProjectionCashItems } from '@/modules/financials/domain/connected-claim-cash-flow';
import { businessDate } from '@/shared/dates';

describe('connected claim projection cash items', () => {
  it('maps active projection rows to incoming forecast lines', () => {
    const items = connectedClaimProjectionCashItems(
      [
        {
          id: 'proj-row-1',
          mappingId: 'map-1',
          contractorProjectId: 'contractor-proj',
          developerClaimId: 'dev-claim',
          developerPayableBasisId: 'basis-1',
          certifiedNet: '100000.00',
          retentionNet: '10000.00',
          currency: 'ILS',
          expectedReceiptDate: businessDate('2026-10-15'),
          certainty: 'confirmed',
          sourceVersion: 1,
        },
      ],
      'ILS',
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.direction).toBe('in');
    expect(items[0]?.sourceType).toBe('certified_subcontract_receipt');
    expect(items[1]?.sourceType).toBe('retention_release_in');
    expect(items[1]?.dueDate).toBeNull();
  });
});
