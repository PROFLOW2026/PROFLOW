/**
 * Provider capability / pricing-tier limits.
 *
 * ProjectFlow keeps a product abuse ceiling; the active Azure tier may tighten it.
 * Effective limit = min(appCeiling, providerTier). Never pretend F0 can do S0 work.
 *
 * Official Azure Document Intelligence (2024-11-30) service limits:
 * - F0: 4 MB / 2 pages / 1 analyze TPS; keyValuePairs + Query Fields not on free tier
 * - S0: 500 MB / 2000 pages / higher TPS; keyValuePairs free add-on; Query Fields paid
 *
 * Hebrew (`he`) is natively supported on prebuilt-invoice and prebuilt-receipt —
 * extraction must not depend on queryFields.
 */

export type AzurePricingTier = 'F0' | 'S0';

/** Product abuse ceiling — independent of Azure tier. */
export const OCR_APP_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const OCR_APP_MAX_PAGES = 50;

export const AZURE_F0_MAX_FILE_BYTES = 4 * 1024 * 1024;
export const AZURE_F0_MAX_PAGES = 2;
export const AZURE_S0_MAX_FILE_BYTES = 500 * 1024 * 1024;
export const AZURE_S0_MAX_PAGES = 2000;

export interface OcrProviderCapabilities {
  readonly providerId: string;
  readonly tier: AzurePricingTier | 'unlimited' | 'unknown';
  readonly maxFileBytes: number;
  readonly maxPages: number;
  /** Free layout/key-value feature — safe on F0. */
  readonly keyValuePairs: boolean;
  /**
   * Paid Query Fields add-on. Off by default. Never auto-enabled on F0.
   * Requires OCR_AZURE_QUERY_FIELDS=true AND tier S0.
   */
  readonly queryFields: boolean;
  readonly queryFieldsCostNote: string | null;
  readonly hebrewNativePrebuilt: boolean;
  readonly analyzeTransactionsPerSecond: number | null;
}

function envTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function readAzurePricingTier(): AzurePricingTier {
  const raw = (typeof process !== 'undefined' ? process.env.OCR_AZURE_TIER : undefined)
    ?.trim()
    .toUpperCase();
  if (raw === 'S0') return 'S0';
  return 'F0';
}

export function isAzureQueryFieldsEnabled(tier: AzurePricingTier = readAzurePricingTier()): boolean {
  if (tier !== 'S0') return false;
  return envTruthy(
    typeof process !== 'undefined' ? process.env.OCR_AZURE_QUERY_FIELDS : undefined,
  );
}

export function resolveAzureCapabilities(
  tier: AzurePricingTier = readAzurePricingTier(),
): OcrProviderCapabilities {
  const queryFields = isAzureQueryFieldsEnabled(tier);
  if (tier === 'F0') {
    return {
      providerId: 'azure',
      tier: 'F0',
      maxFileBytes: Math.min(OCR_APP_MAX_FILE_BYTES, AZURE_F0_MAX_FILE_BYTES),
      maxPages: Math.min(OCR_APP_MAX_PAGES, AZURE_F0_MAX_PAGES),
      // F0 free tier rejects features=keyValuePairs (InvalidParameter).
      keyValuePairs: false,
      queryFields: false,
      queryFieldsCostNote: null,
      hebrewNativePrebuilt: true,
      analyzeTransactionsPerSecond: 1,
    };
  }
  return {
    providerId: 'azure',
    tier: 'S0',
    maxFileBytes: Math.min(OCR_APP_MAX_FILE_BYTES, AZURE_S0_MAX_FILE_BYTES),
    maxPages: Math.min(OCR_APP_MAX_PAGES, AZURE_S0_MAX_PAGES),
    keyValuePairs: true,
    queryFields,
    queryFieldsCostNote: queryFields
      ? 'Query Fields is a paid Azure add-on (~per 1,000 pages); not used unless OCR_AZURE_QUERY_FIELDS=true'
      : 'Query Fields available on S0 but disabled (set OCR_AZURE_QUERY_FIELDS=true to enable)',
    hebrewNativePrebuilt: true,
    analyzeTransactionsPerSecond: 15,
  };
}

/** Default capabilities when no live provider is configured. */
export function resolveDefaultOcrCapabilities(): OcrProviderCapabilities {
  return {
    providerId: 'stub',
    tier: 'unknown',
    maxFileBytes: OCR_APP_MAX_FILE_BYTES,
    maxPages: Math.min(OCR_APP_MAX_PAGES, 10),
    keyValuePairs: false,
    queryFields: false,
    queryFieldsCostNote: null,
    hebrewNativePrebuilt: false,
    analyzeTransactionsPerSecond: null,
  };
}
