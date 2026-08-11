/**
 * Israeli / Hebrew document understanding.
 * Suggests types and identifiers from labels. Never invents amounts or tax rates.
 */

import type { OcrDocumentTypeKey, OcrFieldCandidate } from './types';

const COMPANY_NUMBER_PATTERN = /\b(\d{9})\b/;
const DEALER_PATTERN = /(?:ע\.?\s*מ\.?|עוסק\s*מורשה|מספר\s*עוסק)[^\d]{0,12}(\d{9})/u;
const COMPANY_LABEL_PATTERN = /(?:ח\.?\s*פ\.?|חפ['׳]?)[^\d]{0,12}(\d{9})/u;

export function normalizeIsraeliIdentifier(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 9) return digits;
  if (digits.length === 8) return digits.padStart(9, '0');
  return null;
}

export function extractIsraeliCompanyNumber(text: string): string | null {
  const labeled = text.match(COMPANY_LABEL_PATTERN)?.[1] ?? text.match(DEALER_PATTERN)?.[1];
  if (labeled) return normalizeIsraeliIdentifier(labeled);
  return normalizeIsraeliIdentifier(text.match(COMPANY_NUMBER_PATTERN)?.[1] ?? null);
}

export function suggestDocumentTypeFromText(text: string): OcrDocumentTypeKey {
  const haystack = text.replace(/\s+/g, ' ');
  if (/חשבונית\s*זיכוי|זיכוי/.test(haystack) && /חשבונית|credit/i.test(haystack)) {
    return 'credit_note';
  }
  if (/חשבונית\s*מס\s*\/?\s*קבלה|חשבונית מס\/קבלה/.test(haystack)) {
    return 'tax_invoice_receipt';
  }
  if (/חשבונית\s*עסקה/.test(haystack)) return 'transaction_invoice';
  if (/חשבונית\s*ספק/.test(haystack)) return 'vendor_invoice';
  if (/חשבונית\s*מס/.test(haystack)) return 'tax_invoice';
  if (haystack.includes('קבלה') && !haystack.includes('חשבונית')) return 'receipt';
  if (/credit\s*note/i.test(haystack)) return 'credit_note';
  if (/\binvoice\b/i.test(haystack)) return 'tax_invoice';
  if (/\breceipt\b/i.test(haystack)) return 'receipt';
  return 'unknown';
}

export function documentTypeLabel(key: OcrDocumentTypeKey): string {
  switch (key) {
    case 'tax_invoice':
      return 'חשבונית מס';
    case 'receipt':
      return 'קבלה';
    case 'tax_invoice_receipt':
      return 'חשבונית מס/קבלה';
    case 'transaction_invoice':
      return 'חשבונית עסקה';
    case 'vendor_invoice':
      return 'חשבונית ספק';
    case 'credit_note':
      return 'חשבונית זיכוי';
    default:
      return '';
  }
}

const ILS_HINT = /₪|ש["״]ח|ils\b|nis\b/i;

export function inferCurrencyFromText(
  explicit: string | null | undefined,
  text: string,
): string | null {
  const code = explicit?.trim().toUpperCase();
  if (code && /^[A-Z]{3}$/.test(code)) return code;
  if (ILS_HINT.test(text)) return 'ILS';
  if (/\bUSD\b|\$/.test(text) && !ILS_HINT.test(text)) return 'USD';
  if (/\bEUR\b|€/.test(text)) return 'EUR';
  return code ?? null;
}

export function mergeIdentifierCandidate(
  providerValue: OcrFieldCandidate,
  fromText: string | null,
  provenance: OcrFieldCandidate['provenance'],
): OcrFieldCandidate {
  const normalizedProvider = normalizeIsraeliIdentifier(providerValue.value);
  if (normalizedProvider) {
    return { ...providerValue, value: normalizedProvider };
  }
  const normalizedText = normalizeIsraeliIdentifier(fromText);
  if (normalizedText) {
    return {
      value: normalizedText,
      confidence: providerValue.confidence == null ? 0.6 : Math.min(providerValue.confidence, 0.75),
      provenance,
    };
  }
  return providerValue;
}

export function collectVatRateHints(text: string): string[] {
  const rates = new Set<string>();
  for (const match of text.matchAll(/(\d{1,2}(?:\.\d{1,2})?)\s*%/g)) {
    const value = match[1];
    if (value) rates.add(value);
  }
  return [...rates];
}
