import { describe, expect, it } from 'vitest';
import { mapAzureAnalyzeResult, canonicalToCandidates, collectReviewWarnings } from '@/modules/ocr';
import {
  extractIsraeliInvoiceNumber,
  extractIsraeliSupplierCompanyNumber,
  extractIsraeliCustomerCompanyNumber,
  suggestDocumentTypeFromText,
} from '@/modules/ocr/domain/israeli-normalize';

/**
 * Israeli OCR quality regression fixtures — assert VALUES, not mere field presence.
 * Payloads are synthetic Azure analyzeResult shapes grounded in real document patterns.
 */

function map(content: string, fields: Record<string, unknown>) {
  return mapAzureAnalyzeResult({
    providerId: 'azure',
    model: 'prebuilt-invoice',
    extractedAt: '2026-08-12T00:00:00.000Z',
    analyzeResult: {
      content,
      documents: [{ docType: 'invoice', fields }],
    },
  });
}

describe('Israeli invoice quality fixtures', () => {
  it('1. Owner Arka tax invoice — full financial ground truth', () => {
    const content = `
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
`.trim();

    expect(extractIsraeliInvoiceNumber(content, { supplierIds: ['511022493'] })?.value).toBe(
      '25342606186',
    );

    const c = canonicalToCandidates(
      map(content, {
        VendorName: { valueString: 'ארכה בע"מ', confidence: 0.93 },
        VendorTaxId: { valueString: '511022493', confidence: 0.9 },
        InvoiceDate: { valueDate: '2026-07-26', confidence: 0.91 },
        SubTotal: { valueCurrency: { amount: 6882.33, currencyCode: 'ILS' }, confidence: 0.92 },
        TotalDiscount: { valueCurrency: { amount: 0.13, currencyCode: 'ILS' }, confidence: 0.88 },
        TotalTax: { valueCurrency: { amount: 1238.8, currencyCode: 'ILS' }, confidence: 0.9 },
        InvoiceTotal: { valueCurrency: { amount: 8121, currencyCode: 'ILS' }, confidence: 0.95 },
        AmountDue: { valueCurrency: { amount: 8121, currencyCode: 'ILS' }, confidence: 0.94 },
        TaxDetails: {
          valueArray: [
            {
              valueObject: {
                Rate: { valueString: '18%', confidence: 0.9 },
                Amount: { valueCurrency: { amount: 1238.8 }, confidence: 0.9 },
              },
            },
          ],
        },
      }),
    );

    expect(c.vendor.value).toContain('ארכה');
    expect(c.companyNumber.value).toBe('511022493');
    expect(c.reference.value).toBe('25342606186');
    expect(c.date.value).toBe('2026-07-26');
    expect(c.documentType.value).toBe('חשבונית מס');
    expect(c.subtotal.value).toBe('6882.33');
    expect(c.discount.value).toBe('0.13');
    expect(c.net.value).toBe('6882.20');
    expect(c.tax.value).toBe('1238.80');
    expect(c.vatRate.value).toBe('18');
    expect(c.gross.value).toBe('8121.00');
    expect(c.amountDue.value).toBe('8121.00');
  });

  it('2. Tax invoice with clear Azure InvoiceId', () => {
    const c = canonicalToCandidates(
      map('חשבונית מס ח.פ. 512345678', {
        VendorName: { valueString: 'ספק בדיקה', confidence: 0.9 },
        VendorTaxId: { valueString: '512345678', confidence: 0.9 },
        InvoiceId: { valueString: 'INV-2026-991', confidence: 0.95 },
        InvoiceDate: { valueDate: '2026-06-01', confidence: 0.9 },
        SubTotal: { valueCurrency: { amount: 100, currencyCode: 'ILS' }, confidence: 0.9 },
        TotalTax: { valueCurrency: { amount: 18, currencyCode: 'ILS' }, confidence: 0.9 },
        InvoiceTotal: { valueCurrency: { amount: 118, currencyCode: 'ILS' }, confidence: 0.95 },
      }),
    );
    expect(c.reference.value).toBe('INV-2026-991');
    expect(c.reference.provenance.extractionMethod).toBe('structured');
    expect(c.net.value).toBe('100.00');
    expect(c.gross.value).toBe('118.00');
    expect(c.tax.value).toBe('18.00');
  });

  it('3. Tax invoice / receipt hybrid type', () => {
    const content = 'חשבונית מס/קבלה מספר 445566';
    expect(suggestDocumentTypeFromText(content)).toBe('tax_invoice_receipt');
    const c = canonicalToCandidates(
      map(content, {
        InvoiceTotal: { valueCurrency: { amount: 50, currencyCode: 'ILS' }, confidence: 0.9 },
        TotalTax: { valueCurrency: { amount: 7.63, currencyCode: 'ILS' }, confidence: 0.8 },
      }),
    );
    expect(c.documentType.value).toBe('חשבונית מס/קבלה');
    expect(c.reference.value).toBe('445566');
    expect(c.gross.value).toBe('50.00');
  });

  it('4. Receipt (קבלה) without inventing invoice totals from subtotal', () => {
    const c = canonicalToCandidates(
      map('קבלה על תשלום מזומן', {
        MerchantName: { valueString: 'חנות פינה', confidence: 0.9 },
        SubTotal: { valueCurrency: { amount: 40, currencyCode: 'ILS' }, confidence: 0.9 },
        TotalTax: { valueCurrency: { amount: 7.2, currencyCode: 'ILS' }, confidence: 0.85 },
        // no InvoiceTotal / Total — gross must stay missing
      }),
    );
    expect(c.documentType.value).toBe('קבלה');
    expect(c.vendor.value).toBe('חנות פינה');
    expect(c.subtotal.value).toBe('40.00');
    expect(c.gross.value).toBeNull();
    expect(
      collectReviewWarnings(c, { vendorResolved: true, draftTarget: 'expense' }).some(
        (w) => w.code === 'gross_missing',
      ),
    ).toBe(true);
  });

  it('5. Credit note routes as credit type', () => {
    const c = canonicalToCandidates(
      map('חשבונית זיכוי מספר 778899', {
        VendorName: { valueString: 'ספק זיכוי', confidence: 0.9 },
        InvoiceId: { valueString: '778899', confidence: 0.9 },
        InvoiceTotal: { valueCurrency: { amount: -200, currencyCode: 'ILS' }, confidence: 0.9 },
        TotalTax: { valueCurrency: { amount: -30.51, currencyCode: 'ILS' }, confidence: 0.85 },
        SubTotal: { valueCurrency: { amount: -169.49, currencyCode: 'ILS' }, confidence: 0.85 },
      }),
    );
    expect(c.documentType.value).toBe('חשבונית זיכוי');
    expect(c.reference.value).toBe('778899');
    expect(c.gross.value).toBe('-200.00');
  });

  it('6. Document-level discount reconciles net without inventing gross', () => {
    const c = canonicalToCandidates(
      map('חשבונית מס הנחה 12.50 סכום לפני מע"מ', {
        SubTotal: { valueCurrency: { amount: 500, currencyCode: 'ILS' }, confidence: 0.9 },
        TotalDiscount: { valueCurrency: { amount: 12.5, currencyCode: 'ILS' }, confidence: 0.9 },
        TotalTax: { valueCurrency: { amount: 87.75, currencyCode: 'ILS' }, confidence: 0.9 },
        InvoiceTotal: { valueCurrency: { amount: 575.25, currencyCode: 'ILS' }, confidence: 0.95 },
      }),
    );
    expect(c.discount.value).toBe('12.50');
    expect(c.net.value).toBe('487.50');
    expect(c.gross.value).toBe('575.25');
    expect(c.tax.value).toBe('87.75');
  });

  it('7. Multiple VAT rates stay as hints without inventing a single rate', () => {
    const content = 'חשבונית מס מע"מ 18% ומע"מ 0% על פטור';
    const canonical = map(content, {
      SubTotal: { valueCurrency: { amount: 200, currencyCode: 'ILS' }, confidence: 0.9 },
      TotalTax: { valueCurrency: { amount: 18, currencyCode: 'ILS' }, confidence: 0.9 },
      InvoiceTotal: { valueCurrency: { amount: 218, currencyCode: 'ILS' }, confidence: 0.9 },
    });
    expect(canonical.money.vatRates).toEqual(expect.arrayContaining(['18', '0']));
    // Ambiguous multi-rate → do not force a single vatRate field
    expect(canonical.money.vatRate.value).toBeNull();
  });

  it('8. Zero-VAT / exempt invoice keeps tax at 0 and may surface labeled 0% rate', () => {
    const c = canonicalToCandidates(
      map('חשבונית מס מע"מ 0% פטור ממע"מ', {
        SubTotal: { valueCurrency: { amount: 90, currencyCode: 'ILS' }, confidence: 0.9 },
        TotalTax: { valueCurrency: { amount: 0, currencyCode: 'ILS' }, confidence: 0.9 },
        InvoiceTotal: { valueCurrency: { amount: 90, currencyCode: 'ILS' }, confidence: 0.95 },
      }),
    );
    expect(c.net.value).toBe('90.00');
    expect(c.tax.value).toBe('0.00');
    expect(c.gross.value).toBe('90.00');
    expect(c.vatRate.value).toBe('0');
  });

  it('9–11. Photographed / PDF / low-quality Hebrew still recover labeled invoice number', () => {
    const noisy = `חשבונית מס\nארכה\nמס' חשבונית   25342606186\nסה"כ כולל מע"מ 8,121.00`;
    expect(extractIsraeliInvoiceNumber(noisy)?.value).toBe('25342606186');
    const c = canonicalToCandidates(
      map(noisy, {
        InvoiceTotal: { valueCurrency: { amount: 8121, currencyCode: 'ILS' }, confidence: 0.7 },
      }),
    );
    expect(c.reference.value).toBe('25342606186');
    expect(c.gross.value).toBe('8121.00');
  });

  it('12. Supplier vs customer company IDs stay separated', () => {
    const content = `
חשבונית מס
ספק: ארכה בע"מ ח.פ. 511022493
לכבוד לקוח דוגמה ח.פ. 514628903
מספר חשבונית 25342606186
`.trim();
    expect(extractIsraeliSupplierCompanyNumber(content)).toBe('511022493');
    expect(extractIsraeliCustomerCompanyNumber(content)).toBe('514628903');

    const canonical = map(content, {
      VendorTaxId: { valueString: '511022493', confidence: 0.9 },
      CustomerTaxId: { valueString: '514628903', confidence: 0.85 },
      CustomerName: { valueString: 'לקוח דוגמה', confidence: 0.8 },
      InvoiceTotal: { valueCurrency: { amount: 100, currencyCode: 'ILS' }, confidence: 0.9 },
    });
    expect(canonical.supplier.companyNumber.value).toBe('511022493');
    expect(canonical.metadata.customer?.taxId).toBe('514628903');
    expect(canonical.supplier.companyNumber.value).not.toBe(canonical.metadata.customer?.taxId);

    const warnings = collectReviewWarnings(canonicalToCandidates(canonical), {
      vendorResolved: true,
      draftTarget: 'vendor_bill',
      organizationTaxId: '599999999',
      customerTaxId: canonical.metadata.customer?.taxId,
    });
    expect(warnings.some((w) => w.code === 'possible_wrong_customer')).toBe(true);
  });

  it('rejects company number as invoice number when labeled poorly', () => {
    expect(
      extractIsraeliInvoiceNumber('מספר חשבונית 511022493', {
        supplierIds: ['511022493'],
      }),
    ).toBeNull();
  });

  it('warns on totals mismatch without rewriting provider values', () => {
    const c = canonicalToCandidates(
      map('חשבונית מס', {
        SubTotal: { valueCurrency: { amount: 100, currencyCode: 'ILS' }, confidence: 0.9 },
        TotalTax: { valueCurrency: { amount: 18, currencyCode: 'ILS' }, confidence: 0.9 },
        InvoiceTotal: { valueCurrency: { amount: 999, currencyCode: 'ILS' }, confidence: 0.9 },
      }),
    );
    expect(c.net.value).toBe('100.00');
    expect(c.gross.value).toBe('999.00');
    expect(
      collectReviewWarnings(c, { vendorResolved: true, draftTarget: 'expense' }).some(
        (w) => w.code === 'totals_mismatch',
      ),
    ).toBe(true);
  });
});
