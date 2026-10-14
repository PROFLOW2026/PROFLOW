import { describe, expect, it } from 'vitest';
import {
  buildStatutoryBridgeFromBillingRecord,
  mapBillingLinesForStatutoryBridge,
} from '@/modules/invoicing-integration/application/build-statutory-bridge';
import { DomainRuleError } from '@/shared/errors';
import { businessDate } from '@/shared/dates';
import type { BillingRecordDetail } from '@/modules/billing/domain/types';

const ORG_ID = '01900000-0000-7000-8000-0000000000aa';
const BILLING_ID = '01900000-0000-7000-8000-0000000000bb';

function detailWithLines(
  lines: BillingRecordDetail['lines'],
  overrides: Partial<BillingRecordDetail> = {},
): BillingRecordDetail {
  return {
    id: BILLING_ID,
    projectId: null,
    projectName: null,
    clientId: null,
    reference: 'ח-ב/2026/09',
    issueDate: businessDate('2026-09-01'),
    dueDate: businessDate('2026-10-01'),
    status: 'finalized',
    kind: 'invoice',
    totalAmount: { amount: '57230.000000', currency: 'ILS' },
    paidAmount: { amount: '0.000000', currency: 'ILS' },
    outstandingAmount: { amount: '57230.000000', currency: 'ILS' },
    subtotalAmount: { amount: '48500.000000', currency: 'ILS' },
    taxAmount: { amount: '8730.000000', currency: 'ILS' },
    vatMode: 'exclusive',
    taxSnapshot: null,
    customerSnapshot: {
      name: 'Demo Client',
      companyNumber: null,
      externalIdentifier: null,
      email: null,
      phone: null,
      address: null,
      city: null,
      postalCode: null,
      noVat: false,
    },
    finalizedAt: new Date(),
    voidedAt: null,
    voidsBillingRecordId: null,
    externalDocumentId: null,
    notes: null,
    collectionContactedAt: null,
    collectionNextFollowUpAt: null,
    collectionPromiseToPayDate: null,
    collectionNote: null,
    lines,
    payments: [],
    collectionStatus: 'open',
    ...overrides,
  };
}

describe('statutory line net normalization (B01)', () => {
  it('normalizes single legacy gross line to header subtotal', () => {
    const detail = detailWithLines([
      {
        id: 'line-gross',
        description: 'Legacy gross',
        lineTotal: { amount: '57230.000000', currency: 'ILS' },
        changeOrderId: null,
        sortOrder: 0,
      },
    ]);
    const mapped = mapBillingLinesForStatutoryBridge(detail);
    expect(mapped[0]?.lineNet.amount).toBe('48500.000000');
  });

  it('blocks multi-line legacy gross CO rows', () => {
    const detail = detailWithLines([
      {
        id: 'line-a',
        description: 'CO A gross',
        lineTotal: { amount: '57230.000000', currency: 'ILS' },
        changeOrderId: 'co-a',
        sortOrder: 0,
      },
      {
        id: 'line-b',
        description: 'CO B gross',
        lineTotal: { amount: '57230.000000', currency: 'ILS' },
        changeOrderId: 'co-b',
        sortOrder: 1,
      },
    ]);
    expect(() => mapBillingLinesForStatutoryBridge(detail)).toThrow(DomainRuleError);
  });

  it('bridge uses normalized net lines', () => {
    const detail = detailWithLines([
      {
        id: 'line-net',
        description: 'Net line',
        lineTotal: { amount: '48500.000000', currency: 'ILS' },
        changeOrderId: null,
        sortOrder: 0,
      },
    ]);
    const { bridge } = buildStatutoryBridgeFromBillingRecord({ organizationId: ORG_ID }, detail);
    expect(bridge.lines[0]?.lineNet.amount).toBe('48500.000000');
  });
});
