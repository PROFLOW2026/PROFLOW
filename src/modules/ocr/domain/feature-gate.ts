/**
 * OCR ingestion feature gate — OFF by default.
 *
 * Customer-visible “working OCR” requires an explicit enable flag AND a
 * non-stub provider with credentials AND a verified live HTTP analyze path.
 * A stub alone never counts as live OCR. Azure credentials alone never count
 * as live while the adapter still returns empty_result skeletons.
 */

export type OcrFeatureMode =
  | 'disabled'
  | 'fixture_only'
  | 'configured_pending'
  | 'live';

/**
 * Flip only after Azure (or other HTTP provider) analyze+poll is wired and
 * verified to return real fields — never while extract returns empty_result.
 */
export const AZURE_OCR_LIVE_HTTP_READY = true;

function envTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function readProviderId(): string {
  if (typeof process === 'undefined') return 'stub';
  return process.env.OCR_PROVIDER?.trim().toLowerCase() || 'stub';
}

function readApiKey(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env.OCR_PROVIDER_API_KEY?.trim() || undefined;
}

function readEndpoint(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env.OCR_PROVIDER_ENDPOINT?.trim() || undefined;
}

/** True when env asks for ingestion — still not sufficient for live OCR alone. */
export function isOcrIngestionFlagOn(): boolean {
  if (typeof process === 'undefined') return false;
  return envTruthy(process.env.OCR_INGESTION_ENABLED);
}

/** Internal sample seed — never production; never presented as real OCR. */
export function isOcrFixtureAllowed(): boolean {
  if (typeof process === 'undefined') return false;
  if (process.env.NODE_ENV === 'production') return false;
  return envTruthy(process.env.OCR_ALLOW_FIXTURE);
}

/** Credentials present for a non-stub provider (may still be adapter-pending). */
export function isOcrProviderCredentialsPresent(): boolean {
  const providerId = readProviderId();
  if (!providerId || providerId === 'stub') return false;
  if (!readApiKey()) return false;
  if (providerId === 'azure' && !readEndpoint()) return false;
  return true;
}

/**
 * True only when a real HTTP extract path is ready.
 * Azure requires AZURE_OCR_LIVE_HTTP_READY after analyze+poll is wired.
 */
export function isLiveOcrProviderConfigured(): boolean {
  if (!isOcrProviderCredentialsPresent()) return false;
  const providerId = readProviderId();
  if (providerId === 'azure') return AZURE_OCR_LIVE_HTTP_READY;
  // Unknown non-stub providers are not treated as live without an explicit path.
  return false;
}

/**
 * Effective product mode:
 * - disabled (default): no customer-visible OCR surfaces
 * - fixture_only: local/test review of samples — not working OCR
 * - configured_pending: credentials present but live HTTP extract not ready
 * - live: real provider HTTP extract verified + enable flag
 */
export function getOcrFeatureMode(): OcrFeatureMode {
  if (!isOcrIngestionFlagOn()) return 'disabled';
  if (isLiveOcrProviderConfigured()) return 'live';
  if (isOcrProviderCredentialsPresent()) return 'configured_pending';
  if (isOcrFixtureAllowed()) return 'fixture_only';
  return 'disabled';
}

/** Customer-visible OCR ingestion (live provider path only). */
export function isOcrIngestionEnabled(): boolean {
  return getOcrFeatureMode() === 'live';
}

/** Review UI may load (live, pending credentials, or explicit local fixture tooling). */
export function isOcrReviewUiAllowed(): boolean {
  const mode = getOcrFeatureMode();
  return (
    mode === 'live' ||
    mode === 'fixture_only' ||
    mode === 'configured_pending'
  );
}

