'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  resolveInstallCapability,
  type InstallCapability,
  type InstallPromptOutcome,
} from '../domain/installability';
import {
  getDeferredInstallPrompt,
  initPwaInstallPromptCapture,
  promptPwaInstall,
  subscribePwaAppInstalled,
  subscribePwaInstallPrompt,
} from './pwa-install-prompt-capture';

function readStandaloneFlags(): {
  displayModeStandalone: boolean;
  iosNavigatorStandalone: boolean;
} {
  if (typeof window === 'undefined') {
    return { displayModeStandalone: false, iosNavigatorStandalone: false };
  }
  const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const iosNavigatorStandalone =
    'standalone' in window.navigator &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return { displayModeStandalone, iosNavigatorStandalone };
}

function capabilityFromStore(): InstallCapability {
  if (typeof window === 'undefined') return 'unavailable';
  return resolveInstallCapability({
    ...readStandaloneFlags(),
    userAgent: navigator.userAgent,
    hasDeferredPrompt: getDeferredInstallPrompt() !== null,
  });
}

export function usePwaInstall() {
  // SSR and the first client paint must agree — browser install signals are read after mount.
  const [capability, setCapability] = useState<InstallCapability>('unavailable');
  const [promptOutcome, setPromptOutcome] = useState<InstallPromptOutcome | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    initPwaInstallPromptCapture();

    const syncFromStore = () => {
      setCapability(capabilityFromStore());
    };

    const onInstalled = () => {
      setPromptOutcome('accepted');
      setCapability('installed');
    };

    const media = window.matchMedia('(display-mode: standalone)');
    const unsubPrompt = subscribePwaInstallPrompt(syncFromStore);
    const unsubInstalled = subscribePwaAppInstalled(onInstalled);
    media.addEventListener('change', syncFromStore);

    // Sync after listeners attach (covers BIP that fired before this mount).
    queueMicrotask(syncFromStore);

    return () => {
      unsubPrompt();
      unsubInstalled();
      media.removeEventListener('change', syncFromStore);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallPromptOutcome> => {
    setInstalling(true);
    try {
      const outcome = await promptPwaInstall();
      setPromptOutcome(outcome);
      if (outcome === 'accepted') {
        setCapability('installed');
      } else {
        setCapability(capabilityFromStore());
      }
      return outcome;
    } finally {
      setInstalling(false);
    }
  }, []);

  return {
    capability,
    installing,
    promptOutcome,
    promptInstall,
  };
}
