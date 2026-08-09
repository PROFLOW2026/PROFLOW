'use client';

import { useEffect } from 'react';

/**
 * Registers the installable shell service worker in production only.
 * Skipped in development to avoid Turbopack/HMR cache races.
 * Does not subscribe to push — no notification product in Wave 4.
 *
 * Calls `registration.update()` on load and when the tab becomes visible so
 * clients pick up shell cache bumps (skipWaiting + clients.claim) without
 * staying trapped on a stale worker.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    let cancelled = false;
    let registration: ServiceWorkerRegistration | undefined;

    const refreshWorker = () => {
      if (cancelled || !registration) return;
      void registration.update().catch(() => {
        // Update probe failures must not break the app shell.
      });
    };

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        if (cancelled) return;
        registration = reg;
        refreshWorker();
      })
      .catch(() => {
        // Registration failures must not break the app shell.
      });

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshWorker();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
