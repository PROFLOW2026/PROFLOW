/**
 * Pure helpers for the ProjectFlow offline shell service worker.
 * Kept free of browser globals so unit tests can lock the cache policy.
 */

export const SHELL_CACHE_NAME = 'projectflow-shell-v2';

/** Precache + cache-first allowlist (installable shell only; not the manifest). */
export const SHELL_PRECACHE_URLS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/offline.html',
] as const;

/** Always try the network first so install metadata is not trapped on an old SW cache. */
export const SHELL_NETWORK_FIRST_URLS = ['/manifest.webmanifest'] as const;

export function isShellAssetUrl(pathname: string): boolean {
  return (SHELL_PRECACHE_URLS as readonly string[]).includes(pathname);
}

export function isNetworkFirstShellUrl(pathname: string): boolean {
  return (SHELL_NETWORK_FIRST_URLS as readonly string[]).includes(pathname);
}

/**
 * Navigations and Next.js RSC payloads must hit the network.
 * Only static shell assets use cache-first. Manifest uses network-first.
 */
export function shouldUseCacheFirst(request: {
  readonly method: string;
  readonly mode: string;
  readonly pathname: string;
}): boolean {
  if (request.method !== 'GET') return false;
  if (request.mode === 'navigate') return false;
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
