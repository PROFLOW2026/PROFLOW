'use client';

import { useEffect } from 'react';
import { initPwaInstallPromptCapture } from './pwa-install-prompt-capture';
import { ServiceWorkerRegistrar } from './service-worker-registrar';

// Capture as soon as this client module evaluates - BIP is one-shot and often
// fires before React effects run (LEO KIDS `_app` module-init pattern).
if (typeof window !== 'undefined') {
  initPwaInstallPromptCapture();
}

/**
 * Early PWA shell bootstrap for every locale route (public, auth, app).
 * Captures `beforeinstallprompt` at the layout root and registers the SW
 * in production - must not wait for Settings → App or AppShell.
 *
 * Module-init registration overlaps document fetch with worker boot so the
 * installed-app splash is not serialized behind React effects. Auth still
 * uses the normal session path on the document - SW registration never
 * awaits session.
 */
export function PwaBootstrap() {
  useEffect(() => {
    initPwaInstallPromptCapture();
  }, []);

  return <ServiceWorkerRegistrar />;
}

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Registration failures must not break the splash or auth shell.
    });
  }
}
