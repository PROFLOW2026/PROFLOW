/**
 * Pure helpers for the ProjectFlow offline shell service worker.
 * Kept free of browser globals so unit tests can lock the cache policy.
 */

export const SHELL_CACHE_NAME = 'projectflow-shell-v1';

/** Precache + cache-first allowlist (installable shell only). */
export const SHELL_PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/offline.html',
] as const;

export function isShellAssetUrl(pathname: string): boolean {
  return (SHELL_PRECACHE_URLS as readonly string[]).includes(pathname);
}

/**
 * Navigations and Next.js RSC payloads must hit the network.
 * Only static shell assets use cache-first.
 */
export function shouldUseCacheFirst(request: {
  readonly method: string;
  readonly mode: string;
  readonly pathname: string;
}): boolean {
  if (request.method !== 'GET') return false;
  if (request.mode === 'navigate') return false;
  return isShellAssetUrl(request.pathname);
}

export function shouldServeOfflineFallback(request: {
  readonly method: string;
  readonly mode: string;
}): boolean {
  return request.method === 'GET' && request.mode === 'navigate';
}
