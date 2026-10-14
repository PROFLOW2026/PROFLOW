import { describe, expect, it } from 'vitest';
import { captureTaxSnapshot } from '@/modules/billing/domain/tax';
import { buildSumitCreatePayload } from '@/modules/invoicing-integration/providers/sumit/sumit-create-payload';
import { buildStatutoryBridgeFromBillingRecord } from '@/modules/invoicing-integration/application/build-statutory-bridge';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import type { BillingRecordDetail } from '@/modules/billing/domain/types';

function creditNoteDetail(overrides: Partial<BillingRecordDetail> = {}): BillingRecordDetail {
  return {
    id: '01900000-0000-7000-8000-000000000003',
    projectId: '01900000-0000-7000-8000-000000000002',
    projectName: null,
    clientId: null,
    reference: 'INV-1-ADJ',
    issueDate: businessDate('2026-09-15'),
    dueDate: null,
    status: 'finalized',
    kind: 'credit_note',
    totalAmount: { amount: '1180.000000', currency: 'ILS' },
    paidAmount: { amount: '0.000000', currency: 'ILS' },
    outstandingAmount: { amount: '1180.000000', currency: 'ILS' },
    subtotalAmount: { amount: '1000.000000', currency: 'ILS' },
    taxAmount: { amount: '180.000000', currency: 'ILS' },
    vatMode: 'exclusive',
    taxSnapshot: {
      subtotalAmount: '1000.000000',
      taxAmount: '180.000000',
      totalAmount: '1180.000000',
      currency: 'ILS',
      capturedAt: new Date().toISOString(),
      vatMode: 'exclusive',
      vatRatePercent: 18,
    },
    customerSnapshot: {
      name: 'Client',
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
    voidsBillingRecordId: '01900000-0000-7000-8000-000000000001',
    externalDocumentId: null,
    notes: null,
    collectionContactedAt: null,
    collectionNextFollowUpAt: null,
    collectionPromiseToPayDate: null,
    collectionNote: null,
    lines: [
      {
        id: 'line-1',
        description: 'Billing adjustment',
        lineTotal: { amount: '1000.000000', currency: 'ILS' },
        changeOrderId: null,
        sortOrder: 0,
      },
    ],
    payments: [],
    collectionStatus: 'open',
    ...overrides,
  };
}

describe('credit note net billing line (B01)', () => {
  it('captureTaxSnapshot stores vatRatePercent like finalize path', () => {
    const subtotal = money('1000', 'ILS');
    const tax = money('180', 'ILS');
    const total = money('1180', 'ILS');
    const snapshot = captureTaxSnapshot(subtotal, tax, total, {
      vatMode: 'exclusive',
      vatRatePercent: 18,
    });
    expect(snapshot.vatRatePercent).toBe(18);
    expect(snapshot.subtotalAmount).toBe('1000.000000');
  });

  it('exclusive credit bridge → SUMIT payload uses net line and VATRate 18', () => {
    const detail = creditNoteDetail();
    const { bridge } = buildStatutoryBridgeFromBillingRecord(
      { organizationId: '01900000-0000-7000-8000-0000000000aa' },
      detail,
    );
    expect(bridge.lines[0]?.lineNet.amount).toBe('1000.000000');
    const payload = buildSumitCreatePayload({ billing: bridge, kind: 'credit_note' });
    expect(payload.VATRate).toBe(18);
    expect(payload.VATIncluded).toBe(false);
  });

  it('zero-VAT credit → VATRate 0 on payload', () => {
    const detail = creditNoteDetail({
      vatMode: 'zero',
      taxAmount: { amount: '0.000000', currency: 'ILS' },
      totalAmount: { amount: '1000.000000', currency: 'ILS' },
      taxSnapshot: {
        subtotalAmount: '1000.000000',
        taxAmount: '0.000000',
        totalAmount: '1000.000000',
        currency: 'ILS',
        capturedAt: new Date().toISOString(),
        vatMode: 'zero',
        vatRatePercent: 0,
      },
    });
    const { bridge } = buildStatutoryBridgeFromBillingRecord(
      { organizationId: '01900000-0000-7000-8000-0000000000aa' },
      detail,
    );
    const payload = buildSumitCreatePayload({ billing: bridge, kind: 'credit_note' });
    expect(payload.VATRate).toBe(0);
  });
});
