/**
 * Azure (and future providers) model selection.
 *
 * One paid model per file. Never run receipt + invoice on the same document.
 *
 * Hebrew is natively supported on both prebuilt models (Document Intelligence
 * v4 / 2024-11-30 language support). Native extraction is the primary path.
 *
 * - Expense / receipt-oriented capture → receipt model (typical till slips).
 * - AP / vendor credit / general documents → invoice model (tax id, due date, lines).
 * - Explicit OCR_PROVIDER_MODEL overrides the strategy (still one call).
 */

import type { OcrWorkflowContext } from './types';

export type OcrModelStrategy = 'receipt' | 'invoice';

export const AZURE_RECEIPT_MODEL = 'prebuilt-receipt';
export const AZURE_INVOICE_MODEL = 'prebuilt-invoice';
export const AZURE_API_VERSION = '2024-11-30';

/** Prefer language code `he` (official language-support tables), not he-IL. */
export const AZURE_HEBREW_LOCALE = 'he';

export function resolveModelStrategy(workflow: OcrWorkflowContext | undefined): OcrModelStrategy {
  if (workflow === 'expense') return 'receipt';
  return 'invoice';
}

export function resolveAzureModelId(
  workflow: OcrWorkflowContext | undefined,
  explicitModel?: string | null,
): { readonly model: string; readonly strategy: OcrModelStrategy } {
  const strategy = resolveModelStrategy(workflow);
  const trimmed = explicitModel?.trim();
  if (trimmed) {
    const inferred: OcrModelStrategy = /receipt/i.test(trimmed) ? 'receipt' : 'invoice';
    return { model: trimmed, strategy: inferred };
  }
  return {
    model: strategy === 'receipt' ? AZURE_RECEIPT_MODEL : AZURE_INVOICE_MODEL,
    strategy,
  };
}

/**
 * Optional Israel-specific Query Fields - ONLY when OCR_AZURE_QUERY_FIELDS=true
 * on S0. Never required for Hebrew. Never sent on F0.
 *
 * Native invoice already returns VendorName, VendorTaxId, InvoiceId, dates,
 * totals, Items. These query names only help when a native field is missing.
 */
export const AZURE_ISRAEL_QUERY_FIELDS = [
  'CompanyNumber',
  'AuthorizedDealerNumber',
] as const;
