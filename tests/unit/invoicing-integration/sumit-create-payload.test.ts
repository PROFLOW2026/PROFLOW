import { describe, expect, it } from 'vitest';
import { buildStatutoryIdempotencyKey } from '@/modules/invoicing-integration';
import {
  assembleSumitCreateRequestBody,
  buildSumitCreatePayload,
  mapSumitDocumentItem,
  SUMIT_DOCUMENT_TYPE_INVOICE,
  SUMIT_INCOME_ITEM_SEARCH_MODE_NONE,
} from '@/modules/invoicing-integration/providers/sumit/sumit-create-payload';
import type { BillingRecordBridgeRef } from '@/modules/invoicing-integration';

const BILLING_ID = '4a5e81dc-42ba-440c-a129-2c23b2296d64';

function demoBridge(): BillingRecordBridgeRef {
  return {
    billingRecordId: BILLING_ID,
    organizationId: 'b1460c82-36cd-429a-b30d-ea5644d58fe3',
    projectId: null,
    clientId: null,
    kind: 'invoice',
    status: 'finalized',
    reference: 'ח-ב/2026/09',
    subtotalAmount: { amount: '48500.000000', currency: 'ILS' },
    taxAmount: { amount: '8730.000000', currency: 'ILS' },
    totalAmount: { amount: '57230.000000', currency: 'ILS' },
    vatMode: 'exclusive',
    vatRatePercent: 18,
    lines: [
      {
        description: 'עבודות חשמל כוח ותאורה',
        lineNet: { amount: '30000.000000', currency: 'ILS' },
        quantity: null,
        unitPrice: null,
      },
      {
        description: 'לוחות חשמל',
        lineNet: { amount: '12500.000000', currency: 'ILS' },
        quantity: null,
        unitPrice: null,
      },
    ],
    issuer: null,
    customer: {
      name: 'אופק בנייה ויזמות בע״מ',
      companyNumber: null,
      externalIdentifier: null,
      email: null,
      phone: null,
      address: null,
      city: null,
      postalCode: null,
      noVat: false,
    },
    issueDate: '2026-09-18',
    dueDate: '2026-11-30',
    notes: null,
    externalReference: buildStatutoryIdempotencyKey(BILLING_ID, 'tax_invoice'),
  };
}

describe('SUMIT create payload shape', () => {
  it('matches OpenAPI Accounting_Documents_Create_Request nesting', () => {
    const payload = buildSumitCreatePayload(demoBridge());
    const externalReference = buildStatutoryIdempotencyKey(BILLING_ID, 'tax_invoice');
    const requestBody = assembleSumitCreateRequestBody(payload, externalReference);

    expect(requestBody).toEqual({
      Details: {
        Type: SUMIT_DOCUMENT_TYPE_INVOICE,
        Date: '2026-09-18',
        DueDate: '2026-11-30',
        Currency: 'ILS',
        Customer: {
          Name: 'אופק בנייה ויזמות בע״מ',
          CompanyNumber: null,
          ExternalIdentifier: null,
          EmailAddress: null,
          Phone: null,
          Address: null,
          City: null,
          ZipCode: null,
          NoVAT: false,
        },
        ExternalReference: externalReference,
      },
      Items: [
        {
          Item: {
            Name: 'עבודות חשמל כוח ותאורה',
            SearchMode: SUMIT_INCOME_ITEM_SEARCH_MODE_NONE,
          },
          Quantity: 1,
          UnitPrice: 30000,
          TotalPrice: 30000,
        },
        {
          Item: {
            Name: 'לוחות חשמל',
            SearchMode: SUMIT_INCOME_ITEM_SEARCH_MODE_NONE,
          },
          Quantity: 1,
          UnitPrice: 12500,
          TotalPrice: 12500,
        },
      ],
      VATIncluded: false,
      VATRate: 18,
    });

    expect(requestBody).not.toHaveProperty('Customer');
    expect((requestBody.Details as Record<string, unknown>).Customer).toBeTruthy();
  });

  it('maps each billing line to nested Item + quantity/price totals per Swagger', () => {
    const mapped = mapSumitDocumentItem({
      description: 'תשתיות ותקשורת',
      lineNet: { amount: '6000.000000', currency: 'ILS' },
      quantity: '2',
      unitPrice: '3000.000000',
    });

    expect(mapped).toEqual({
      Item: {
        Name: 'תשתיות ותקשורת',
        SearchMode: SUMIT_INCOME_ITEM_SEARCH_MODE_NONE,
      },
      Quantity: 2,
      UnitPrice: 3000,
      TotalPrice: 6000,
    });
  });
});
