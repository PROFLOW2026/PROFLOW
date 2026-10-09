/**
 * FIN-003 / FIN-004 — mock SUMIT statutory credit/cancel/idempotency (EXEC).
 * AUDIT ONLY — mirrors tests/unit/invoicing-integration/sumit-credit-cancel-and-payment-plan.test.ts
 */
import { describe, expect, it } from 'vitest';
import type { BillingRecordBridgeRef } from '@/modules/invoicing-integration';
import { buildStatutoryIdempotencyKey } from '@/modules/invoicing-integration/domain/idempotency-key';
import {
  buildSumitCancelRequestBody,
  buildSumitCreatePayload,
  resolveSumitDocumentType,
  SUMIT_CANCEL_DOCUMENT_PATH,
  SUMIT_DOCUMENT_TYPE_CREDIT_INVOICE,
} from '@/modules/invoicing-integration/providers/sumit/sumit-create-payload';
import {
  SumitAmbiguousError,
  type SumitHttpClient,
} from '@/modules/invoicing-integration/providers/sumit/sumit-http-client';
import {
  SumitAmbiguousCreateError,
  SumitStatutoryProvider,
} from '@/modules/invoicing-integration/providers/sumit/sumit-statutory-provider';

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

describe('audit FIN-003/004 mock SUMIT chain (EXEC)', () => {
  it('FIN-004: credit note type 5 + OriginalDocumentID + provider creditDocument success', async () => {
    expect(resolveSumitDocumentType('credit_note')).toBe(SUMIT_DOCUMENT_TYPE_CREDIT_INVOICE);
    const idempotencyKey = buildStatutoryIdempotencyKey('credit-note-1', 'credit_note');
    const payload = buildSumitCreatePayload({
      billing: creditBridge(),
      kind: 'credit_note',
      linkedTaxInvoiceExternalId: '42',
      description: 'partial return',
    });
    expect(payload.OriginalDocumentID).toBe(42);
    expect(payload.Details).toMatchObject({ Type: 5, Description: 'partial return' });
    expect(payload.Payments).toBeUndefined();

    const created: Array<{ documentType: number; externalReference: string }> = [];
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
    const result = await provider.creditDocument({
      organizationId: 'org',
      externalId: '42',
      reason: 'partial return',
      idempotencyKey,
      billing: creditBridge(),
    });
    expect(result.ok).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]?.documentType).toBe(5);
  });

  it('FIN-003: cancel body at provider boundary; ambiguous credit is not success', async () => {
    expect(SUMIT_CANCEL_DOCUMENT_PATH).toBe('/accounting/documents/cancel/');
    expect(buildSumitCancelRequestBody('42', 'void at provider')).toEqual({
      DocumentID: 42,
      Description: 'void at provider',
    });

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
