import { describe, expect, it } from 'vitest';
import type { BillingRecordBridgeRef, ExternalStatutoryDocument } from '@/modules/invoicing-integration';
import { buildStatutoryIdempotencyKey } from '@/modules/invoicing-integration/domain/idempotency-key';
import {
  selectCreditNoteForStatutoryCredit,
  statutoryCreditOriginalStatusPatch,
} from '@/modules/invoicing-integration/domain/credit-note-link';
import { planStatutoryIssuanceAfterPayment } from '@/modules/invoicing-integration/domain/plan-statutory-after-payment';
import type { OrgInvoicingSettings } from '@/modules/invoicing-integration/domain/org-invoicing-settings';
import {
  buildSumitCancelRequestBody,
  buildSumitCreatePayload,
  resolveSumitDocumentType,
  SUMIT_CANCEL_DOCUMENT_PATH,
  SUMIT_DOCUMENT_TYPE_CREDIT_INVOICE,
  SUMIT_DOCUMENT_TYPE_INVOICE,
} from '@/modules/invoicing-integration/providers/sumit/sumit-create-payload';
import {
  SumitAmbiguousError,
  type SumitHttpClient,
} from '@/modules/invoicing-integration/providers/sumit/sumit-http-client';
import {
  SumitAmbiguousCreateError,
  SumitStatutoryProvider,
} from '@/modules/invoicing-integration/providers/sumit/sumit-statutory-provider';

const PAYMENT_ID = 'pay-1';
const BILL_A = 'bill-a';
const BILL_B = 'bill-b';

const automaticReceipts: OrgInvoicingSettings = {
  mode: 'external_provider',
  paymentDocumentPolicy: 'tax_invoice_then_receipt',
  receiptIssuance: 'automatic',
};

function statutoryDoc(
  overrides: Partial<ExternalStatutoryDocument> & Pick<ExternalStatutoryDocument, 'id' | 'billingRecordId' | 'kind'>,
): ExternalStatutoryDocument {
  return {
    organizationId: 'org',
    paymentId: null,
    providerId: 'sumit',
    status: 'issued',
    externalId: '42',
    externalNumber: '100',
    externalUrl: null,
    pdf: null,
    allocationReference: null,
    issuanceOutcome: 'confirmed_created',
    reconciliationStatus: null,
    reconciliationMetadata: null,
    idempotencyKey: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    requestedAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    issuedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function creditBridge(): BillingRecordBridgeRef {
  return {
    billingRecordId: 'credit-note-1',
    organizationId: 'org',
    projectId: null,
    clientId: null,
    kind: 'credit_note',
    status: 'finalized',
    reference: 'CN-1',
    subtotalAmount: { amount: '100.000000', currency: 'ILS' },
    taxAmount: { amount: '18.000000', currency: 'ILS' },
    totalAmount: { amount: '118.000000', currency: 'ILS' },
    vatMode: 'exclusive',
    vatRatePercent: 18,
    lines: [
      {
        description: 'Billing adjustment',
        lineNet: { amount: '100.000000', currency: 'ILS' },
        quantity: '1',
        unitPrice: '100.000000',
      },
    ],
    issuer: null,
    customer: {
      name: 'לקוח לדוגמה',
      companyNumber: null,
      externalIdentifier: null,
      email: null,
      phone: null,
      address: null,
      city: null,
      postalCode: null,
      noVat: false,
    },
    issueDate: '2026-09-01',
    dueDate: null,
    notes: null,
    externalReference: 'pf:credit-note-1:credit_note:v1',
  };
}

describe('SUMIT credit and cancel payloads', () => {
  it('maps a credit note to CreditInvoice type 5, not an invoice or donation receipt', () => {
    expect(resolveSumitDocumentType('credit_note')).toBe(SUMIT_DOCUMENT_TYPE_CREDIT_INVOICE);
    expect(SUMIT_DOCUMENT_TYPE_CREDIT_INVOICE).toBe(5);
    expect(resolveSumitDocumentType('credit_note')).not.toBe(SUMIT_DOCUMENT_TYPE_INVOICE);
    expect(resolveSumitDocumentType('credit_note')).not.toBe(4);
  });

  it('builds a credit create payload linked to the original document without payment lines', () => {
    const idempotencyKey = buildStatutoryIdempotencyKey('credit-note-1', 'credit_note');
    const payload = buildSumitCreatePayload({
      billing: creditBridge(),
      kind: 'credit_note',
      linkedTaxInvoiceExternalId: '42',
      description: 'partial return',
    });

    expect(payload.OriginalDocumentID).toBe(42);
    expect(payload.Payments).toBeUndefined();
    expect(payload.Details).toMatchObject({
      Type: 5,
      Description: 'partial return',
    });
    expect(idempotencyKey).toBe('pf:credit-note-1:credit_note:v1');
  });

  it('builds the confirmed cancel body and refuses an empty description', () => {
    expect(SUMIT_CANCEL_DOCUMENT_PATH).toBe('/accounting/documents/cancel/');
    expect(buildSumitCancelRequestBody('42', 'void at provider')).toEqual({
      DocumentID: 42,
      Description: 'void at provider',
    });
    expect(buildSumitCancelRequestBody('42', '   ')).toBeNull();
    expect(buildSumitCancelRequestBody('not-a-number', 'reason')).toBeNull();
  });

  it('returns success only when SUMIT create returns a credit DocumentID', async () => {
    const created: Array<{ documentType: number; externalReference: string; payload: Record<string, unknown> }> =
      [];
    const client: SumitHttpClient = {
      async createDocument(input) {
        created.push(input);
        return {
          documentId: '900',
          documentNumber: '55',
          netAmount: null,
          vatAmount: null,
          grossAmount: null,
          raw: {},
        };
      },
      async getDocumentDetails() {
        return {
          documentId: '900',
          documentNumber: '55',
          netAmount: null,
          vatAmount: null,
          grossAmount: null,
          raw: {},
        };
      },
      async getDocumentPdf() {
        throw new Error('not used');
      },
      async listExpenseDocuments() {
        return [];
      },
      async cancelDocument() {
        throw new Error('not used');
      },
      async sendDocument() {
        return undefined;
      },
      async ping() {
        return true;
      },
      async testConnection() {
        return { ok: true };
      },
    };

    const provider = new SumitStatutoryProvider({
      credentials: { companyId: 1, apiKey: 'key' },
      httpClient: client,
    });
    const idempotencyKey = buildStatutoryIdempotencyKey('credit-note-1', 'credit_note');
    const result = await provider.creditDocument({
      organizationId: 'org',
      externalId: '42',
      reason: 'partial return',
      idempotencyKey,
      billing: creditBridge(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.creditExternalId).toBe('900');
    }
    expect(created).toHaveLength(1);
    expect(created[0]?.documentType).toBe(5);
    expect(created[0]?.externalReference).toBe(idempotencyKey);
    expect(created[0]?.payload.OriginalDocumentID).toBe(42);
  });

  it('does not treat an ambiguous credit response as success', async () => {
    const client: SumitHttpClient = {
      async createDocument() {
        throw new SumitAmbiguousError('SUMIT request timed out');
      },
      async getDocumentDetails() {
        throw new Error('not used');
      },
      async getDocumentPdf() {
        throw new Error('not used');
      },
      async listExpenseDocuments() {
        return [];
      },
      async cancelDocument() {
        throw new Error('not used');
      },
      async sendDocument() {
        return undefined;
      },
      async ping() {
        return true;
      },
      async testConnection() {
        return { ok: true };
      },
    };
    const provider = new SumitStatutoryProvider({
      credentials: { companyId: 1, apiKey: 'key' },
      httpClient: client,
    });

    await expect(
      provider.creditDocument({
        organizationId: 'org',
        externalId: '42',
        reason: 'partial return',
        idempotencyKey: buildStatutoryIdempotencyKey('credit-note-1', 'credit_note'),
        billing: creditBridge(),
      }),
    ).rejects.toBeInstanceOf(SumitAmbiguousCreateError);
  });
});

describe('credit note link', () => {
  it('requires one internal credit note and does not rewrite original amounts', () => {
    expect(selectCreditNoteForStatutoryCredit({ creditNoteIds: [] })).toEqual({
      ok: false,
      error: 'missing_credit_note',
    });
    expect(selectCreditNoteForStatutoryCredit({ creditNoteIds: ['cn-1'] })).toEqual({
      ok: true,
      creditNoteId: 'cn-1',
    });
    expect(
      selectCreditNoteForStatutoryCredit({ creditNoteIds: ['cn-1', 'cn-2'] }),
    ).toEqual({ ok: false, error: 'ambiguous_credit_note' });
    expect(
      selectCreditNoteForStatutoryCredit({
        explicitCreditNoteId: 'cn-2',
        creditNoteIds: ['cn-1', 'cn-2'],
      }),
    ).toEqual({ ok: true, creditNoteId: 'cn-2' });

    expect(statutoryCreditOriginalStatusPatch()).toEqual({ status: 'credited' });
    expect(Object.keys(statutoryCreditOriginalStatusPatch())).toEqual(['status']);
  });
});

describe('split payment statutory plan', () => {
  it('issues a receipt with the existing payment idempotency key when a tax invoice exists', () => {
    const plan = planStatutoryIssuanceAfterPayment({
      settings: automaticReceipts,
      billingDocuments: [
        statutoryDoc({ id: 'inv-a', billingRecordId: BILL_A, kind: 'tax_invoice', externalId: '42' }),
      ],
      paymentDocuments: [],
      paymentId: PAYMENT_ID,
      billingRecordId: BILL_A,
    });

    expect(plan).toEqual({
      action: 'issue',
      kind: 'receipt',
      idempotencyKey: `pf:payment:${PAYMENT_ID}:receipt:v1`,
      linkedTaxInvoiceExternalId: '42',
    });
    if (plan.action === 'issue') {
      expect(plan.idempotencyKey).toBe(
        buildStatutoryIdempotencyKey(BILL_A, 'receipt', PAYMENT_ID),
      );
    }
  });

  it('skips a second receipt for another allocation of the same payment', () => {
    const plan = planStatutoryIssuanceAfterPayment({
      settings: automaticReceipts,
      billingDocuments: [
        statutoryDoc({ id: 'inv-b', billingRecordId: BILL_B, kind: 'tax_invoice', externalId: '77' }),
      ],
      paymentDocuments: [
        statutoryDoc({
          id: 'receipt-a',
          billingRecordId: BILL_A,
          kind: 'receipt',
          paymentId: PAYMENT_ID,
          idempotencyKey: buildStatutoryIdempotencyKey(BILL_A, 'receipt', PAYMENT_ID),
        }),
      ],
      paymentId: PAYMENT_ID,
      billingRecordId: BILL_B,
    });

    expect(plan).toEqual({ action: 'skip', reason: 'payment_document_already_scoped' });
  });

  it('issues a tax invoice receipt only when no tax invoice exists and policy allows it', () => {
    const combined = planStatutoryIssuanceAfterPayment({
      settings: {
        ...automaticReceipts,
        paymentDocumentPolicy: 'tax_invoice_receipt_on_payment',
      },
      billingDocuments: [],
      paymentDocuments: [],
      paymentId: PAYMENT_ID,
      billingRecordId: BILL_A,
    });
    expect(combined).toEqual({
      action: 'issue',
      kind: 'tax_invoice_receipt',
      idempotencyKey: `pf:payment:${PAYMENT_ID}:tax_invoice_receipt:v1`,
      linkedTaxInvoiceExternalId: null,
    });

    const waiting = planStatutoryIssuanceAfterPayment({
      settings: automaticReceipts,
      billingDocuments: [],
      paymentDocuments: [],
      paymentId: PAYMENT_ID,
      billingRecordId: BILL_A,
    });
    expect(waiting).toEqual({ action: 'skip', reason: 'tax_invoice_required_first' });
  });

  it('does not issue when receipt automation is off', () => {
    const plan = planStatutoryIssuanceAfterPayment({
      settings: { ...automaticReceipts, receiptIssuance: 'manual' },
      billingDocuments: [],
      paymentDocuments: [],
      paymentId: PAYMENT_ID,
      billingRecordId: BILL_A,
    });
    expect(plan).toEqual({ action: 'skip', reason: 'receipt_issuance_off' });
  });
});
