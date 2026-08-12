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
 *
 * `controllerchange` reloads only when replacing an existing controller.
 * The first claim after register must not reload — that wiped in-flight
 * sign-in forms and Playwright auth setup.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    let cancelled = false;
    let registration: ServiceWorkerRegistration | undefined;
    let refreshing = false;
    let hadController = Boolean(navigator.serviceWorker.controller);

    const refreshWorker = () => {
      if (cancelled || !registration) return;
      void registration.update().catch(() => {
        // Update probe failures must not break the app shell.
      });
    };

    const onControllerChange = () => {
      if (refreshing) return;
      if (!hadController) {
        hadController = true;
        return;
      }
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        if (cancelled) return;
        registration = reg;
        // Do not call update() immediately — first claim + update can interrupt
        // in-flight auth and form edits. Visibility probes still refresh.
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
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}
