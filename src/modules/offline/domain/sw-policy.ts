/**
 * Pure helpers for the ProjectFlow offline shell service worker.
 * Kept free of browser globals so unit tests can lock the cache policy.
 */

export const SHELL_CACHE_NAME = 'projectflow-shell-v3';

/** Installed-app cold start: document fetch must overlap worker boot. */
export const SHELL_NAVIGATION_PRELOAD = true;

/** Precache + cache-first allowlist (installable shell only; not the manifest). */
export const SHELL_PRECACHE_URLS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/offline.html',
] as const;

/** Always try the network first so install metadata is not trapped on an old SW cache. */
export const SHELL_NETWORK_FIRST_URLS = ['/manifest.webmanifest'] as const;

/**
 * Path fragments that must never be SW-cached (sensitive financial surfaces).
 * Field offline is queue/draft based — not full-app financial page cache.
 */
export const SENSITIVE_FINANCIAL_PATH_MARKERS = [
  '/billing',
  '/financials',
  '/receivables',
  '/payables',
  '/procurement/ap',
  '/bank',
  '/banking',
  '/invoices',
  '/profit',
  '/cashflow',
  '/tax',
  '/reports',
  '/month-close',
  '/quotes',
] as const;

export function isShellAssetUrl(pathname: string): boolean {
  return (SHELL_PRECACHE_URLS as readonly string[]).includes(pathname);
}

export function isNetworkFirstShellUrl(pathname: string): boolean {
  return (SHELL_NETWORK_FIRST_URLS as readonly string[]).includes(pathname);
}

/** True when the pathname looks like a sensitive financial app route. */
export function isSensitiveFinancialPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return SENSITIVE_FINANCIAL_PATH_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Navigations and Next.js RSC payloads must hit the network.
 * Only static shell assets use cache-first. Manifest uses network-first.
 * Sensitive financial paths are never cache-eligible.
 */
export function shouldUseCacheFirst(request: {
  readonly method: string;
  readonly mode: string;
  readonly pathname: string;
}): boolean {
  if (request.method !== 'GET') return false;
  if (request.mode === 'navigate') return false;
  if (isSensitiveFinancialPath(request.pathname)) return false;
  if (isNetworkFirstShellUrl(request.pathname)) return false;
  return isShellAssetUrl(request.pathname);
}

export function shouldUseNetworkFirst(request: {
  readonly method: string;
  readonly mode: string;
  readonly pathname: string;
}): boolean {
  if (request.method !== 'GET') return false;
  if (request.mode === 'navigate') return false;
  return isNetworkFirstShellUrl(request.pathname);
}

export function shouldServeOfflineFallback(request: {
  readonly method: string;
  readonly mode: string;
}): boolean {
  return request.method === 'GET' && request.mode === 'navigate';
}
