import { describe, expect, it } from 'vitest';
import { mapAzureAnalyzeResult, suggestedDraftTarget } from '@/modules/ocr';

describe('Azure analyzeResult mapper', () => {
  it('maps invoice fields into the canonical contract without leaking Azure names', () => {
    const canonical = mapAzureAnalyzeResult({
      providerId: 'azure',
      model: 'prebuilt-invoice',
      extractedAt: '2026-08-12T00:00:00.000Z',
      analyzeResult: {
        modelId: 'prebuilt-invoice',
        content: 'חשבונית מס ח.פ. 512345678 סה״כ 117 ₪',
        pages: [{}, {}],
        languages: [{ locale: 'he' }],
        documents: [
          {
            docType: 'invoice',
            fields: {
              VendorName: { valueString: 'ספק דוגמה', confidence: 0.92 },
              VendorTaxId: { valueString: '512345678', confidence: 0.88 },
              InvoiceId: { valueString: 'INV-88', confidence: 0.9 },
              InvoiceDate: { valueDate: '2026-08-01', confidence: 0.91 },
              DueDate: { valueDate: '2026-08-30', confidence: 0.8 },
              PurchaseOrder: { valueString: 'PO-1', confidence: 0.7 },
              SubTotal: { valueCurrency: { amount: 100, currencyCode: 'ILS' }, confidence: 0.9 },
              TotalTax: { valueCurrency: { amount: 17, currencyCode: 'ILS' }, confidence: 0.85 },
              InvoiceTotal: { valueCurrency: { amount: 117, currencyCode: 'ILS' }, confidence: 0.94 },
              Items: {
                valueArray: [
                  {
                    valueObject: {
                      Description: { valueString: 'ברגים', confidence: 0.8 },
                      Quantity: { valueNumber: 2, confidence: 0.8 },
                      UnitPrice: { valueCurrency: { amount: 50 }, confidence: 0.8 },
                      Amount: { valueCurrency: { amount: 100 }, confidence: 0.8 },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    expect(canonical.supplier.name.value).toBe('ספק דוגמה');
    expect(canonical.supplier.companyNumber.value).toBe('512345678');
    expect(canonical.identity.documentNumber.value).toBe('INV-88');
    expect(canonical.identity.issueDate.value).toBe('2026-08-01');
    expect(canonical.money.currency.value).toBe('ILS');
    expect(canonical.money.gross.value).toBe('117');
    expect(canonical.lines).toHaveLength(1);
    expect(canonical.lines[0]?.description.value).toBe('ברגים');
    expect(canonical.documentTypeKey).toBe('tax_invoice');
    expect(canonical.pageCount).toBe(2);
    expect(JSON.stringify(canonical)).not.toMatch(/VendorName|InvoiceId|InvoiceTotal/);
    expect(suggestedDraftTarget('general', canonical.documentTypeKey)).toBe('vendor_bill');
  });

  it('uses Hebrew key-value pairs when structured fields are missing', () => {
    const canonical = mapAzureAnalyzeResult({
      providerId: 'azure',
      model: 'prebuilt-invoice',
      extractedAt: '2026-08-12T00:00:00.000Z',
      analyzeResult: {
        content: 'קבלה',
        keyValuePairs: [
          { key: { content: 'שם עסק' }, value: { content: 'חנות פינה' } },
          { key: { content: 'מספר חשבונית' }, value: { content: 'R-9' } },
        ],
        documents: [{ fields: {} }],
      },
    });
    expect(canonical.supplier.name.value).toBe('חנות פינה');
    expect(canonical.identity.documentNumber.value).toBe('R-9');
    expect(canonical.documentTypeKey).toBe('receipt');
  });
});
