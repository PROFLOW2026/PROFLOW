import type { BillingRecordBridgeRef } from '@/modules/invoicing-integration';

const ORG_ID = '01900000-0000-7000-8000-0000000000aa';
const BILLING_ID = '01900000-0000-7000-8000-0000000000bb';

export function bridge(overrides: Partial<BillingRecordBridgeRef> = {}): BillingRecordBridgeRef {
  return {
    billingRecordId: BILLING_ID,
    organizationId: ORG_ID,
    projectId: null,
    clientId: null,
    kind: 'invoice',
    status: 'finalized',
    reference: 'BR-100',
    subtotalAmount: { amount: '100.000000', currency: 'ILS' },
    taxAmount: { amount: '17.000000', currency: 'ILS' },
    totalAmount: { amount: '117.000000', currency: 'ILS' },
    vatMode: 'exclusive',
    vatRatePercent: 17,
    lines: [],
    issuer: null,
    customer: null,
    issueDate: '2026-08-01',
    dueDate: null,
    notes: null,
    externalReference: 'idem-1',
    ...overrides,
  };
}
