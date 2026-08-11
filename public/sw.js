/* ProjectFlow offline shell — no push notifications.
 * Cache-first only for installable shell assets (not the manifest).
 * Navigations stay network-first. Manifest is network-first so updates are not trapped.
 *
 * start_url "/" is locale-safe via src/proxy.ts: bare paths honor NEXT_LOCALE,
 * otherwise default he-IL — Accept-Language alone never invents /en.
 */
const SHELL_CACHE = 'projectflow-shell-v2';
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
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        const fallback = await cache.match('/offline.html');
        return fallback || Response.error();
      }),
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
