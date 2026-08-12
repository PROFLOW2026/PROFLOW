import { describe, expect, it } from 'vitest';
import {
  collectVatRateHints,
  documentTypeLabel,
  extractIsraeliCompanyNumber,
  extractIsraeliCustomerCompanyNumber,
  extractIsraeliInvoiceNumber,
  extractIsraeliSupplierCompanyNumber,
  inferCurrencyFromText,
  normalizeIsraeliIdentifier,
  suggestDocumentTypeFromText,
} from '@/modules/ocr/domain/israeli-normalize';
import { suggestedDraftTarget } from '@/modules/ocr';

describe('Israeli document normalization', () => {
  it('normalizes ח.פ. / ע.מ. identifiers', () => {
    expect(normalizeIsraeliIdentifier('ח.פ. 512345678')).toBe('512345678');
    expect(normalizeIsraeliIdentifier('51234567')).toBe('051234567');
    expect(extractIsraeliCompanyNumber('עוסק מורשה 512345678 תל אביב')).toBe('512345678');
    expect(extractIsraeliCompanyNumber('ח.פ. 514628903')).toBe('514628903');
  });

  it('suggests Hebrew document types without accounting conclusions', () => {
    expect(suggestDocumentTypeFromText('חשבונית מס מספר 12')).toBe('tax_invoice');
    expect(suggestDocumentTypeFromText('קבלה על תשלום')).toBe('receipt');
    expect(suggestDocumentTypeFromText('חשבונית מס/קבלה')).toBe('tax_invoice_receipt');
    expect(suggestDocumentTypeFromText('חשבונית עסקה')).toBe('transaction_invoice');
    expect(suggestDocumentTypeFromText('חשבונית ספק')).toBe('vendor_invoice');
    expect(suggestDocumentTypeFromText('חשבונית זיכוי')).toBe('credit_note');
    expect(documentTypeLabel('credit_note')).toBe('חשבונית זיכוי');
    expect(suggestedDraftTarget('general', 'credit_note')).toBe('vendor_credit');
    expect(suggestedDraftTarget('expense', 'credit_note')).toBe('expense');
  });

  it('infers currency from ₪ / USD / EUR without inventing VAT', () => {
    expect(inferCurrencyFromText(null, 'סה״כ 100 ₪')).toBe('ILS');
    expect(inferCurrencyFromText(null, 'Total 40 USD')).toBe('USD');
    expect(inferCurrencyFromText('eur', 'x')).toBe('EUR');
    expect(collectVatRateHints('מע״מ 17% ומע״מ 0%')).toEqual(expect.arrayContaining(['17', '0']));
    expect(collectVatRateHints('הנחה 50% ללא מע״מ מפורש')).toEqual([]);
  });

  it('extracts labeled invoice numbers and rejects supplier IDs', () => {
    expect(extractIsraeliInvoiceNumber('מספר חשבונית 25342606186')?.value).toBe('25342606186');
    expect(extractIsraeliInvoiceNumber("מס' חשבונית 99887766")?.value).toBe('99887766');
    expect(extractIsraeliInvoiceNumber('זיכוי מספר 11223344')?.value).toBe('11223344');
    expect(
      extractIsraeliInvoiceNumber('מספר חשבונית 511022493', { supplierIds: ['511022493'] }),
    ).toBeNull();
  });

  it('separates supplier and customer company numbers by context', () => {
    const text =
      'ספק ארכה ח.פ. 511022493 לכבוד לקוח ח.פ. 514628903 מספר חשבונית 25342606186';
    expect(extractIsraeliSupplierCompanyNumber(text)).toBe('511022493');
    expect(extractIsraeliCustomerCompanyNumber(text)).toBe('514628903');
  });
});
