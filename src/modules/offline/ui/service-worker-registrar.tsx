'use client';

import { useEffect } from 'react';

/**
 * Registers the installable shell service worker in production only.
 * Skipped in development to avoid Turbopack/HMR cache races.
 * Does not subscribe to push — no notification product in Wave 4.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    let cancelled = false;

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => {
        // Registration failures must not break the app shell.
      });

    return () => {
      cancelled = true;
      void cancelled;
    };
  }, []);

  return null;
}
