import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { DomainRuleError } from '@/shared/errors';
import {
  assertBillingHasCustomerSnapshot,
  buildStatutoryBridgeFromBillingRecord,
  buildStatutoryIdempotencyKey,
} from '@/modules/invoicing-integration';
import type { BillingRecordDetail } from '@/modules/billing/domain/types';

const ORG_ID = '01900000-0000-7000-8000-0000000000aa';
const BILLING_ID = '01900000-0000-7000-8000-0000000000bb';

function billingDetail(overrides: Partial<BillingRecordDetail> = {}): BillingRecordDetail {
  return {
    id: BILLING_ID,
    projectId: '01900000-0000-7000-8000-0000000000cc',
    projectName: 'מרכז מסחרי — ראשון לציון',
    clientId: '01900000-0000-7000-8000-0000000000dd',
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
    taxSnapshot: {
      subtotalAmount: '48500.000000',
      taxAmount: '8730.000000',
      totalAmount: '57230.000000',
      currency: 'ILS',
      capturedAt: '2026-09-01T08:00:00.000Z',
      vatMode: 'exclusive',
      vatRatePercent: 18,
    },
    customerSnapshot: {
      name: 'אופק בנייה ויזמות בע״מ',
      companyNumber: '557012345',
      externalIdentifier: '01900000-0000-7000-8000-0000000000dd',
      email: 'demo+ofek@example.invalid',
      phone: '03-5551234',
      address: 'רחוב המלאכה 14',
      city: 'ראשון לציון',
      postalCode: '7530123',
      noVat: false,
    },
    finalizedAt: new Date('2026-09-01T08:00:00.000Z'),
    voidedAt: null,
    voidsBillingRecordId: null,
    externalDocumentId: null,
    notes: 'חשבון ביצוע חודשי',
    lines: [
      {
        id: 'line-1',
        description: 'עבודות חשמל כוח ותאורה',
        lineTotal: { amount: '28000.000000', currency: 'ILS' },
        changeOrderId: null,
        sortOrder: 0,
      },
    ],
    payments: [],
    collectionStatus: 'open',
    ...overrides,
  };
}

describe('buildStatutoryBridgeFromBillingRecord', () => {
  it('maps finalized billing with customer snapshot to bridge ref', () => {
    const { bridge, idempotencyKey } = buildStatutoryBridgeFromBillingRecord(
      { organizationId: ORG_ID },
      billingDetail(),
    );

    expect(idempotencyKey).toBe(buildStatutoryIdempotencyKey(BILLING_ID, 'tax_invoice'));
    expect(bridge.customer?.name).toBe('אופק בנייה ויזמות בע״מ');
    expect(bridge.vatMode).toBe('exclusive');
    expect(bridge.vatRatePercent).toBe(18);
    expect(bridge.lines[0]?.description).toBe('עבודות חשמל כוח ותאורה');
    expect(bridge.externalReference).toContain(BILLING_ID);
  });

  it('blocks bridge build when customer snapshot is missing', () => {
    expect(() =>
      assertBillingHasCustomerSnapshot(billingDetail({ customerSnapshot: null })),
    ).toThrow(DomainRuleError);
  });
});
