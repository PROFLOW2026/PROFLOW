/* ProjectFlow offline shell — no push notifications.
 * Cache-first only for installable shell assets (not the manifest).
 * Navigations stay network-first with Navigation Preload so installed-app
 * cold start does not wait for the worker to boot before the document fetch.
 *
 * start_url is locale-prefixed via the dynamic manifest. Bare "/" is still
 * rewritten to the cookie locale in src/proxy.ts for already-installed shells.
 */
/* pf-sw-release: ocr-runtime-2026-08-12 */
const SHELL_CACHE = 'projectflow-shell-v4';
const PRECACHE = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/offline.html',
];
const NETWORK_FIRST = ['/manifest.webmanifest'];
/** Never cache sensitive financial app routes (field offline is draft-queue only). */
const SENSITIVE_MARKERS = [
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
  '/documents',
];

function isSensitiveFinancialPath(pathname) {
  const lower = pathname.toLowerCase();
  return SENSITIVE_MARKERS.some((marker) => lower.includes(marker));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('projectflow-shell-') && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isShellAsset(pathname) {
  return PRECACHE.includes(pathname);
}

function isNetworkFirstAsset(pathname) {
  return NETWORK_FIRST.includes(pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Sensitive financial pages: network only, never write into SW caches.
  if (isSensitiveFinancialPath(url.pathname)) {
    return;
  }

  // Never cache-first App Router / RSC / API traffic.
  // Use the preloaded navigation response when Chrome started the document
  // fetch in parallel with worker startup (installed-app cold launch).
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) return preload;
          return await fetch(request, { cache: 'no-store' });
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const fallback = await cache.match('/offline.html');
          return fallback || Response.error();
        }
      })(),
    );
    return;
  }

  if (isNetworkFirstAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        try {
          const response = await fetch(request);
          if (response.ok) {
            await cache.put(request, response.clone());
          }
          return response;
        } catch (error) {
          const cached = await cache.match(request);
          if (cached) return cached;
          throw error;
        }
      })(),
    );
    return;
  }

  if (!isShellAsset(url.pathname)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    })(),
  );
});
