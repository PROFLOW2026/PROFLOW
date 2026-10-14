import { describe, expect, it } from 'vitest';
import { CONTRACT_VALUE_SYNC_EVENT_TYPES } from '@/modules/connected-projects/application/sync-contract-value-projection';

describe('K08 contract value sync event types', () => {
  it('uses stable outbox event type strings', () => {
    expect(CONTRACT_VALUE_SYNC_EVENT_TYPES.agreementValue).toBe('subcontract.agreement.value.sync');
    expect(CONTRACT_VALUE_SYNC_EVENT_TYPES.changeApproved).toBe('subcontract.change.approved.sync');
    expect(CONTRACT_VALUE_SYNC_EVENT_TYPES.paymentReported).toBe('subcontract.payment.reported.sync');
  });
});
