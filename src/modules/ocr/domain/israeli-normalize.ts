/**
 * Israeli / Hebrew document understanding.
 * Suggests types and identifiers from labels. Never invents amounts or tax rates.
 */

import type { OcrDocumentTypeKey, OcrFieldCandidate, OcrExtractionMethod } from './types';

const COMPANY_NUMBER_PATTERN = /\b(\d{9})\b/;
const DEALER_PATTERN = /(?:ע\.?\s*מ\.?|עוסק\s*מורשה|מספר\s*עוסק)[^\d]{0,12}(\d{9})/u;
const COMPANY_LABEL_PATTERN = /(?:ח\.?\s*פ\.?|חפ['׳]?)[^\d]{0,12}(\d{9})/u;
const CUSTOMER_CONTEXT =
  /(?:לכבוד|לקוח|מס['׳.]?\s*לקוח|Customer|Bill\s*To|Sold\s*To)/iu;

const INVOICE_NUMBER_LABEL =
  /(?:מספר\s*חשבונית|חשבונית\s*מס\s*(?:\/\s*קבלה\s*)?(?:מספר|מס['׳.]?|מס:)|חשבונית\s*(?:מספר|מס['׳.]?|מס:)|מס['׳.]?\s*חשבונית|מספר\s*מסמך|זיכוי\s*מספר|Invoice\s*(?:No\.?|Number|#))/iu;

const MONEY_AMOUNT =
  /(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/;

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

/**
 * Prefer supplier-side company numbers. Skip IDs that appear only next to
 * customer/לכבוד labels when a supplier-labeled ID also exists.
 */
export function extractIsraeliSupplierCompanyNumber(text: string): string | null {
  // Non-greedy window after supplier keywords so we do not skip past the first ח.פ.
  // into a later customer identity block.
  const supplierLabeled =
    text.match(
      /(?:ספק|מוכר|Vendor|Supplier)[^\n]{0,48}?(?:ח\.?\s*פ\.?|ע\.?\s*מ\.?|עוסק\s*מורשה)[^\d]{0,12}(\d{9})/iu,
    )?.[1] ?? null;
  if (supplierLabeled) return normalizeIsraeliIdentifier(supplierLabeled);

  const allLabeled = [
    ...text.matchAll(/(?:ח\.?\s*פ\.?|ע\.?\s*מ\.?|עוסק\s*מורשה)[^\d]{0,12}(\d{9})/giu),
  ];
  for (const match of allLabeled) {
    const idx = match.index ?? 0;
    const window = text.slice(Math.max(0, idx - 40), idx + (match[0]?.length ?? 0) + 10);
    if (CUSTOMER_CONTEXT.test(window)) continue;
    return normalizeIsraeliIdentifier(match[1] ?? null);
  }
  return extractIsraeliCompanyNumber(text);
}

export function extractIsraeliCustomerCompanyNumber(text: string): string | null {
  const match = text.match(
    /(?:לכבוד|לקוח|מס['׳.]?\s*לקוח|Customer(?:\s*Tax)?|Bill\s*To)[^\n]{0,80}(?:ח\.?\s*פ\.?|ע\.?\s*מ\.?)[^\d]{0,12}(\d{9})/iu,
  );
  return normalizeIsraeliIdentifier(match?.[1] ?? null);
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
    return {
      ...providerValue,
      value: normalizedProvider,
      provenance: {
        ...providerValue.provenance,
        extractionMethod: providerValue.provenance.extractionMethod ?? 'structured',
      },
    };
  }
  const normalizedText = normalizeIsraeliIdentifier(fromText);
  if (normalizedText) {
    return {
      value: normalizedText,
      confidence: providerValue.confidence == null ? 0.6 : Math.min(providerValue.confidence, 0.75),
      provenance: {
        ...provenance,
        extractionMethod: 'hebrew_labeled',
        rawTextSnippet: fromText?.slice(0, 80),
      },
    };
  }
  return providerValue;
}

export function normalizeVatRateToken(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const match = raw.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%?/);
  if (!match?.[1]) return null;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
  // Canonicalize 18.00 → 18, keep meaningful decimals (17.5).
  if (Number.isInteger(numeric)) return String(numeric);
  return String(numeric);
}

/**
 * Collect VAT rates only from VAT-labeled evidence.
 * Never treat an arbitrary percentage (discount, humidity, etc.) as VAT.
 */
export function collectVatRateHints(text: string): string[] {
  const rates = new Set<string>();
  for (const match of text.matchAll(
    /(?:מע["״]?מ|מ\.?\s*ע\.?\s*מ\.?|VAT(?:\s*rate)?|Tax\s*rate)\s*(?:[:=]|\()?[\s]*(\d{1,2}(?:\.\d{1,2})?)\s*%/giu,
  )) {
    const normalized = normalizeVatRateToken(match[1]);
    if (normalized) rates.add(normalized);
  }
  return [...rates];
}

export function parseMoneyToken(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const normalized = raw
    .trim()
    .replace(/[₪$€]/g, '')
    .replace(/\s+/g, '')
    .replace(/,(?=\d{3}(?:\.|$))/g, '')
    .replace(/,/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function formatMoneyAmount(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

export function moneyNearlyEqual(a: number, b: number, epsilon = 0.02): boolean {
  return Math.abs(a - b) <= epsilon;
}

function looksLikeRejectedInvoiceNumber(
  digits: string,
  options: { supplierIds?: readonly string[]; customerIds?: readonly string[] },
): boolean {
  if (digits.length < 5 || digits.length > 15) return true;
  if (
    digits.length === 9 &&
    (options.supplierIds?.includes(digits) || options.customerIds?.includes(digits))
  ) {
    return true;
  }
  if (/^0\d{8,9}$/.test(digits)) return true;
  if (/^(\d)\1{6,}$/.test(digits)) return true;
  return false;
}

/**
 * Deterministic Hebrew/English invoice-number fallback when Azure InvoiceId is absent.
 * Requires a nearby invoice label - never grabs arbitrary long digit runs.
 */
export function extractIsraeliInvoiceNumber(
  text: string,
  options: { supplierIds?: readonly string[]; customerIds?: readonly string[] } = {},
): { value: string; snippet: string; method: OcrExtractionMethod } | null {
  const haystack = text.replace(/\u00a0/g, ' ');
  const labeled = new RegExp(`${INVOICE_NUMBER_LABEL.source}[^\\d]{0,24}(\\d{5,15})`, 'iu');
  const match = haystack.match(labeled);
  if (!match?.[1]) return null;
  const digits = match[1];
  if (looksLikeRejectedInvoiceNumber(digits, options)) return null;
  return {
    value: digits,
    snippet: match[0].slice(0, 80),
    method: 'hebrew_labeled',
  };
}

/**
 * Labeled money fallback from raw OCR text (never invents unlabeled totals).
 */
export function extractLabeledMoneyAmount(
  text: string,
  labels: readonly RegExp[],
): { value: string; snippet: string } | null {
  const haystack = text.replace(/\u00a0/g, ' ');
  for (const label of labels) {
    const pattern = new RegExp(`${label.source}[^\\d]{0,20}${MONEY_AMOUNT.source}`, 'iu');
    const match = haystack.match(pattern);
    if (!match?.[1]) continue;
    const amount = parseMoneyToken(match[1]);
    if (amount == null) continue;
    return { value: formatMoneyAmount(amount), snippet: match[0].slice(0, 80) };
  }
  return null;
}

export const HEBREW_GROSS_LABELS = [
  /סה["״]?כ\s*(?:לתשלום|כולל\s*מע["״]?מ|כולל\s*מס)/,
  /סך\s*הכל\s*(?:לתשלום|כולל)?/,
  /Total\s*(?:Amount|Due|Incl)/,
  /Invoice\s*Total/,
] as const;

export const HEBREW_DISCOUNT_LABELS = [/הנחה/, /Total\s*Discount/, /Discount/] as const;

export const HEBREW_NET_LABELS = [
  /סכום\s*לפני\s*מע["״]?מ/,
  /לפני\s*מע["״]?מ/,
  /אחרי\s*הנחה/,
  /Amount\s*(?:before|excl\.?)\s*(?:VAT|Tax)/,
] as const;
