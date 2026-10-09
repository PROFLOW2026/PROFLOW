/**
 * EXEC proof for FIN-005 — billing lineTotal treated as lineNet in SUMIT payload.
 * AUDIT ONLY.
 */
import { describe, expect, it } from 'vitest';
import { buildStatutoryBridgeFromBillingRecord } from '@/modules/invoicing-integration';
import { mapSumitDocumentItem } from '@/modules/invoicing-integration/providers/sumit/sumit-create-payload';
import { businessDate } from '@/shared/dates';
import type { BillingRecordDetail } from '@/modules/billing/domain/types';

const ORG_ID = '01900000-0000-7000-8000-0000000000aa';
const BILLING_ID = '01900000-0000-7000-8000-0000000000bb';

describe('audit FIN-005 gross lineTotal → SUMIT (EXEC)', () => {
  it('maps lineTotal into lineNet and SUMIT TotalPrice without VAT split on line', () => {
    const grossLine = '57230.000000';
    const detail: BillingRecordDetail = {
      id: BILLING_ID,
      projectId: null,
      projectName: null,
      clientId: null,
      reference: 'ח-ב/2026/09',
      issueDate: businessDate('2026-09-01'),
      dueDate: businessDate('2026-10-01'),
      status: 'finalized',
      kind: 'invoice',
      totalAmount: { amount: grossLine, currency: 'ILS' },
      paidAmount: { amount: '0.000000', currency: 'ILS' },
      outstandingAmount: { amount: grossLine, currency: 'ILS' },
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
      lines: [
        {
          id: 'line-gross',
          description: 'Single gross line',
          lineTotal: { amount: grossLine, currency: 'ILS' },
          changeOrderId: null,
          sortOrder: 0,
        },
      ],
      payments: [],
      collectionStatus: 'open',
    };

    const { bridge } = buildStatutoryBridgeFromBillingRecord({ organizationId: ORG_ID }, detail);
    expect(bridge.lines[0]?.lineNet.amount).toBe(grossLine);

    const sumitLine = mapSumitDocumentItem(bridge.lines[0]!);
    expect(sumitLine.TotalPrice).toBe(57230);
    expect(sumitLine.UnitPrice).toBe(57230);
    expect(bridge.subtotalAmount.amount).toBe('48500.000000');
  });

  it('inclusive VAT: lineTotal still maps to lineNet and SUMIT line totals match bridge', () => {
    const lineTotal = '1180.000000';
    const detail: BillingRecordDetail = {
      ...baseDetail(),
      vatMode: 'inclusive',
      subtotalAmount: { amount: '1000.000000', currency: 'ILS' },
      taxAmount: { amount: '180.000000', currency: 'ILS' },
      totalAmount: { amount: lineTotal, currency: 'ILS' },
      outstandingAmount: { amount: lineTotal, currency: 'ILS' },
      lines: [
        {
          id: 'line-inc',
          description: 'Inclusive line',
          lineTotal: { amount: lineTotal, currency: 'ILS' },
          changeOrderId: null,
          sortOrder: 0,
        },
      ],
    };
    const { bridge } = buildStatutoryBridgeFromBillingRecord({ organizationId: ORG_ID }, detail);
    expect(bridge.lines[0]?.lineNet.amount).toBe(lineTotal);
    const sumitLine = mapSumitDocumentItem(bridge.lines[0]!);
    expect(sumitLine.TotalPrice).toBe(1180);
  });

  it('no-VAT customer: bridge preserves zero tax snapshot on header', () => {
    const detail: BillingRecordDetail = {
      ...baseDetail(),
      taxAmount: { amount: '0.000000', currency: 'ILS' },
      customerSnapshot: { ...baseDetail().customerSnapshot!, noVat: true, name: 'Demo Client' },
      lines: [
        {
          id: 'line-novat',
          description: 'Exempt',
          lineTotal: { amount: '1000.000000', currency: 'ILS' },
          changeOrderId: null,
          sortOrder: 0,
        },
      ],
    };
    const { bridge } = buildStatutoryBridgeFromBillingRecord({ organizationId: ORG_ID }, detail);
    expect(bridge.taxAmount!.amount).toBe('0.000000');
    expect(mapSumitDocumentItem(bridge.lines[0]!).TotalPrice).toBe(1000);
  });
});

function baseDetail(): BillingRecordDetail {
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
    lines: [],
    payments: [],
    collectionStatus: 'open',
  };
}
