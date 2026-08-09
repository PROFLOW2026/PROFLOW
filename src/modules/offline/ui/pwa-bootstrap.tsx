'use client';

import { useEffect } from 'react';
import { initPwaInstallPromptCapture } from './pwa-install-prompt-capture';
import { ServiceWorkerRegistrar } from './service-worker-registrar';

// Capture as soon as this client module evaluates — BIP is one-shot and often
// fires before React effects run (LEO KIDS `_app` module-init pattern).
if (typeof window !== 'undefined') {
  initPwaInstallPromptCapture();
}

/**
 * Early PWA shell bootstrap for every locale route (public, auth, app).
 * Captures `beforeinstallprompt` at the layout root and registers the SW
 * in production — must not wait for Settings → App or AppShell.
 */
export function PwaBootstrap() {
  useEffect(() => {
    initPwaInstallPromptCapture();
  }, []);

  return <ServiceWorkerRegistrar />;
}
