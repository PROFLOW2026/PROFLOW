import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  mapAzureAnalyzeResult,
  canonicalToCandidates,
  collectReviewWarnings,
  lineItemsTrustworthy,
  countTrustworthyLineRows,
} from '@/modules/ocr';
import {
  collectVatRateHints,
  extractIsraeliInvoiceNumber,
} from '@/modules/ocr/domain/israeli-normalize';
import {
  parseOrganizationLegalIdentity,
  resolveOrganizationTaxId,
} from '@/modules/tenancy/domain/legal-identity';

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

describe('Israeli invoice quality — gap closure', () => {
  it('Arka live Azure analyzeResult: header ground truth + line trust blocked', () => {
    const analyzeResult = JSON.parse(
      readFileSync(
        path.resolve('tests/fixtures/ocr/arka-live-azure-analyzeResult.json'),
        'utf8',
      ),
    ) as unknown;
    const canonical = mapAzureAnalyzeResult({
      providerId: 'azure',
      model: 'prebuilt-invoice',
      extractedAt: '2026-08-12T00:00:00.000Z',
      analyzeResult,
    });
    const c = canonicalToCandidates(canonical);
    const counts = countTrustworthyLineRows(c);

    expect(c.vendor.value).toMatch(/ארכה/);
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

    expect(counts.detected).toBe(8);
    expect(counts.substantive).toBeGreaterThan(0);
    expect(counts.trustworthy).toBe(false);
    expect(lineItemsTrustworthy(c)).toBe(false);
    expect(lineItemsTrustworthy(c) ? 'ALLOWED' : 'BLOCKED').toBe('BLOCKED');

    const warnings = collectReviewWarnings(c, {
      vendorResolved: true,
      draftTarget: 'vendor_bill',
    });
    expect(warnings.some((w) => w.code === 'line_sum_mismatch')).toBe(true);
  });

  it('single VAT rate 18% populates primary vatRate', () => {
    const c = canonicalToCandidates(
      map('חשבונית מס מע"מ 18% סה"כ', {
        SubTotal: { valueCurrency: { amount: 100, currencyCode: 'ILS' }, confidence: 0.9 },
        TotalTax: { valueCurrency: { amount: 18, currencyCode: 'ILS' }, confidence: 0.9 },
        InvoiceTotal: { valueCurrency: { amount: 118, currencyCode: 'ILS' }, confidence: 0.95 },
        TaxDetails: {
          valueArray: [
            {
              valueObject: {
                Rate: { valueString: '18%', confidence: 0.95 },
                Amount: { valueCurrency: { amount: 18 }, confidence: 0.9 },
                TaxableAmount: { valueCurrency: { amount: 100 }, confidence: 0.9 },
              },
            },
          ],
        },
      }),
    );
    expect(c.vatRate.value).toBe('18');
    expect(c.tax.value).toBe('18.00');
  });

  it('single VAT rate 17% populates primary vatRate', () => {
    const c = canonicalToCandidates(
      map('חשבונית מס מע"מ 17%', {
        TotalTax: { valueCurrency: { amount: 17, currencyCode: 'ILS' }, confidence: 0.9 },
        InvoiceTotal: { valueCurrency: { amount: 117, currencyCode: 'ILS' }, confidence: 0.9 },
        SubTotal: { valueCurrency: { amount: 100, currencyCode: 'ILS' }, confidence: 0.9 },
        TaxDetails: {
          valueArray: [
            { valueObject: { Rate: { valueString: '17 %', confidence: 0.9 } } },
          ],
        },
      }),
    );
    expect(c.vatRate.value).toBe('17');
  });

  it('multi-rate VAT keeps primary vatRate null and retains all rates', () => {
    const canonical = map('חשבונית מס מע"מ 18% ומע"מ 0% על פטור', {
      SubTotal: { valueCurrency: { amount: 200, currencyCode: 'ILS' }, confidence: 0.9 },
      TotalTax: { valueCurrency: { amount: 18, currencyCode: 'ILS' }, confidence: 0.9 },
      InvoiceTotal: { valueCurrency: { amount: 218, currencyCode: 'ILS' }, confidence: 0.9 },
      TaxDetails: {
        valueArray: [
          { valueObject: { Rate: { valueString: '18%', confidence: 0.9 } } },
          { valueObject: { Rate: { valueString: '0%', confidence: 0.9 } } },
        ],
      },
    });
    expect(canonical.money.vatRate.value).toBeNull();
    expect(canonical.money.vatRates).toEqual(expect.arrayContaining(['18', '0']));
    expect(canonical.metadata.taxDetails?.length).toBe(2);
  });

  it('VAT exempt / zero-rate keeps tax 0 without inventing a statutory rate', () => {
    const c = canonicalToCandidates(
      map('חשבונית מס מע"מ 0%', {
        SubTotal: { valueCurrency: { amount: 90, currencyCode: 'ILS' }, confidence: 0.9 },
        TotalTax: { valueCurrency: { amount: 0, currencyCode: 'ILS' }, confidence: 0.9 },
        InvoiceTotal: { valueCurrency: { amount: 90, currencyCode: 'ILS' }, confidence: 0.95 },
      }),
    );
    expect(c.tax.value).toBe('0.00');
    expect(c.vatRate.value).toBe('0');
    expect(c.gross.value).toBe('90.00');
  });

  it('ambiguous raw percentages unrelated to VAT are ignored', () => {
    expect(collectVatRateHints('הנחה 50% לחות 80% במחסן')).toEqual([]);
    const c = canonicalToCandidates(
      map('חשבונית מס הנחה 50% לחות 80%', {
        InvoiceTotal: { valueCurrency: { amount: 100, currencyCode: 'ILS' }, confidence: 0.9 },
        SubTotal: { valueCurrency: { amount: 100, currencyCode: 'ILS' }, confidence: 0.9 },
        TotalTax: { valueCurrency: { amount: 0, currencyCode: 'ILS' }, confidence: 0.8 },
      }),
    );
    expect(c.vatRate.value).toBeNull();
    expect(c.gross.value).toBe('100.00');
  });

  it('low-quality / rotated Hebrew safety — no invented totals or invoice number', () => {
    const noisy = `
מסמך מטושטש מסובב
ארכה???
חפ .... 
סהכ ???
`.trim();
    expect(extractIsraeliInvoiceNumber(noisy)).toBeNull();
    const c = canonicalToCandidates(
      map(noisy, {
        VendorName: { valueString: '?', confidence: 0.2 },
      }),
    );
    expect(c.reference.value).toBeNull();
    expect(c.gross.value).toBeNull();
    expect(c.net.value).toBeNull();
    expect(c.tax.value).toBeNull();
    expect(c.reference.confidence == null || c.reference.confidence < 0.8).toBe(true);
    const warnings = collectReviewWarnings(c, {
      vendorResolved: true,
      draftTarget: 'expense',
    });
    expect(warnings.some((w) => w.code === 'gross_missing')).toBe(true);
    expect(warnings.some((w) => w.code === 'reference_missing')).toBe(true);
  });

  it('organization tax id wiring helpers — match / mismatch / missing', () => {
    const match = parseOrganizationLegalIdentity({ taxId: '514628903' });
    expect(resolveOrganizationTaxId(match)).toBe('514628903');

    const warningsMatch = collectReviewWarnings(
      canonicalToCandidates(
        map('חשבונית', {
          CustomerTaxId: { valueString: '514628903', confidence: 0.9 },
          InvoiceTotal: { valueCurrency: { amount: 10, currencyCode: 'ILS' }, confidence: 0.9 },
        }),
      ),
      {
        vendorResolved: true,
        draftTarget: 'vendor_bill',
        organizationTaxId: '514628903',
        customerTaxId: '514628903',
      },
    );
    expect(warningsMatch.some((w) => w.code === 'possible_wrong_customer')).toBe(false);

    const warningsMismatch = collectReviewWarnings(
      canonicalToCandidates(
        map('חשבונית', {
          CustomerTaxId: { valueString: '514628903', confidence: 0.9 },
          VendorTaxId: { valueString: '511022493', confidence: 0.9 },
          InvoiceTotal: { valueCurrency: { amount: 10, currencyCode: 'ILS' }, confidence: 0.9 },
        }),
      ),
      {
        vendorResolved: true,
        draftTarget: 'vendor_bill',
        organizationTaxId: '599999999',
        customerTaxId: '514628903',
      },
    );
    expect(warningsMismatch.some((w) => w.code === 'possible_wrong_customer')).toBe(true);
    // Supplier ID must never be treated as customer ID for this warning.
    expect(warningsMismatch.some((w) => w.code === 'possible_wrong_customer')).toBe(true);
    const supplierOnly = collectReviewWarnings(
      canonicalToCandidates(
        map('חשבונית', {
          VendorTaxId: { valueString: '511022493', confidence: 0.9 },
          InvoiceTotal: { valueCurrency: { amount: 10, currencyCode: 'ILS' }, confidence: 0.9 },
        }),
      ),
      {
        vendorResolved: true,
        draftTarget: 'vendor_bill',
        organizationTaxId: '599999999',
        customerTaxId: null,
      },
    );
    expect(supplierOnly.some((w) => w.code === 'possible_wrong_customer')).toBe(false);

    const missingCustomer = collectReviewWarnings(
      canonicalToCandidates(
        map('חשבונית', {
          InvoiceTotal: { valueCurrency: { amount: 10, currencyCode: 'ILS' }, confidence: 0.9 },
        }),
      ),
      {
        vendorResolved: true,
        draftTarget: 'vendor_bill',
        organizationTaxId: '514628903',
        customerTaxId: null,
      },
    );
    expect(missingCustomer.some((w) => w.code === 'possible_wrong_customer')).toBe(false);
  });
});
