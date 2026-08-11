import { describe, expect, it } from 'vitest';
import {
  collectVatRateHints,
  documentTypeLabel,
  extractIsraeliCompanyNumber,
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
    expect(collectVatRateHints('מע״מ 17% וגם 0%')).toEqual(expect.arrayContaining(['17', '0']));
  });
});
