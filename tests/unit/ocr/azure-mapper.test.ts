import { describe, expect, it } from 'vitest';
import { mapAzureAnalyzeResult, suggestedDraftTarget, canonicalToCandidates } from '@/modules/ocr';
import { extractIsraeliInvoiceNumber } from '@/modules/ocr/domain/israeli-normalize';
import { collectReviewWarnings } from '@/modules/ocr/domain/totals-warnings';

/** Ground-truth owner Arka (ארכה) tax invoice sample. */
const ARKA_CONTENT = `
חשבונית מס
ארכה בע"מ, סניף גבעת ברנר
ח.פ. 511022493
מספר חשבונית 25342606186
תאריך 26/07/2026
סה"כ לפני הנחה 6,882.33
הנחה 0.13
סכום לפני מע"מ 6,882.20
מע"מ 18% 1,238.80
סה"כ כולל מע"מ 8,121.00
סה"כ לתשלום 8,121.00
`.trim();

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
                      Tax: { valueCurrency: { amount: 17 }, confidence: 0.7 },
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
    expect(canonical.money.gross.value).toBe('117.00');
    expect(canonical.money.net.value).toBe('100.00');
    expect(canonical.lines).toHaveLength(1);
    expect(canonical.lines[0]?.description.value).toBe('ברגים');
    expect(canonical.lines[0]?.netAmount.value).toBe('100.00');
    expect(canonical.lines[0]?.lineTotal.value).toBe('117.00');
    expect(canonical.documentTypeKey).toBe('tax_invoice');
    expect(canonical.pageCount).toBe(2);
    expect(JSON.stringify(canonical)).not.toMatch(/VendorName|InvoiceId|InvoiceTotal/);
    expect(suggestedDraftTarget('general', canonical.documentTypeKey)).toBe('vendor_bill');
  });

  it('never copies subtotal into gross when InvoiceTotal is missing', () => {
    const canonical = mapAzureAnalyzeResult({
      providerId: 'azure',
      model: 'prebuilt-invoice',
      extractedAt: '2026-08-12T00:00:00.000Z',
      analyzeResult: {
        content: 'חשבונית מס',
        documents: [
          {
            fields: {
              SubTotal: { valueCurrency: { amount: 6882.33, currencyCode: 'ILS' }, confidence: 0.9 },
              TotalTax: { valueCurrency: { amount: 1238.8, currencyCode: 'ILS' }, confidence: 0.9 },
            },
          },
        ],
      },
    });
    expect(canonical.money.subtotal.value).toBe('6882.33');
    expect(canonical.money.gross.value).toBeNull();
    expect(canonical.money.gross.value).not.toBe(canonical.money.subtotal.value);
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

  it('maps Arka owner sample financials and Hebrew invoice number fallback', () => {
    const invoiceFallback = extractIsraeliInvoiceNumber(ARKA_CONTENT, {
      supplierIds: ['511022493'],
    });
    expect(invoiceFallback?.value).toBe('25342606186');

    const canonical = mapAzureAnalyzeResult({
      providerId: 'azure',
      model: 'prebuilt-invoice',
      extractedAt: '2026-08-12T00:00:00.000Z',
      analyzeResult: {
        content: ARKA_CONTENT,
        documents: [
          {
            docType: 'invoice',
            fields: {
              VendorName: { valueString: 'ארכה בע"מ', confidence: 0.93 },
              VendorTaxId: { valueString: '511022493', confidence: 0.9 },
              InvoiceDate: { valueDate: '2026-07-26', confidence: 0.91 },
              // InvoiceId intentionally absent — Hebrew fallback must recover it.
              SubTotal: { valueCurrency: { amount: 6882.33, currencyCode: 'ILS' }, confidence: 0.92 },
              TotalDiscount: { valueCurrency: { amount: 0.13, currencyCode: 'ILS' }, confidence: 0.88 },
              TotalTax: { valueCurrency: { amount: 1238.8, currencyCode: 'ILS' }, confidence: 0.9 },
              InvoiceTotal: { valueCurrency: { amount: 8121, currencyCode: 'ILS' }, confidence: 0.95 },
              AmountDue: { valueCurrency: { amount: 8121, currencyCode: 'ILS' }, confidence: 0.94 },
              TaxDetails: {
                valueArray: [
                  {
                    valueObject: {
                      Amount: { valueCurrency: { amount: 1238.8 }, confidence: 0.9 },
                      Rate: { valueString: '18 %', confidence: 0.9 },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    });

    const candidates = canonicalToCandidates(canonical);
    expect(candidates.vendor.value).toContain('ארכה');
    expect(candidates.companyNumber.value).toBe('511022493');
    expect(candidates.reference.value).toBe('25342606186');
    expect(candidates.reference.provenance.extractionMethod).toBe('hebrew_labeled');
    expect(candidates.date.value).toBe('2026-07-26');
    expect(candidates.documentType.value).toBe('חשבונית מס');
    expect(candidates.subtotal.value).toBe('6882.33');
    expect(candidates.discount.value).toBe('0.13');
    expect(candidates.net.value).toBe('6882.20');
    expect(candidates.tax.value).toBe('1238.80');
    expect(candidates.vatRate.value).toBe('18');
    expect(candidates.gross.value).toBe('8121.00');
    expect(candidates.amountDue.value).toBe('8121.00');
    expect(candidates.currency.value).toBe('ILS');

    const warnings = collectReviewWarnings(candidates, {
      vendorResolved: true,
      draftTarget: 'vendor_bill',
    });
    expect(warnings.map((w) => w.code)).not.toContain('totals_mismatch');
    expect(warnings.map((w) => w.code)).not.toContain('discount_mismatch');
  });
});
