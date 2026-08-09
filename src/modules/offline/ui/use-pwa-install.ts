'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  resolveInstallCapability,
  type InstallCapability,
  type InstallPromptOutcome,
} from '../domain/installability';

interface BeforeInstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

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

function initialCapability(): InstallCapability {
  if (typeof window === 'undefined') return 'unavailable';
  return resolveInstallCapability({
    ...readStandaloneFlags(),
    userAgent: navigator.userAgent,
    hasDeferredPrompt: false,
  });
}

export function usePwaInstall() {
  const [capability, setCapability] = useState<InstallCapability>(initialCapability);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [promptOutcome, setPromptOutcome] = useState<InstallPromptOutcome | null>(null);
  const [installing, setInstalling] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const recompute = useCallback((prompt: BeforeInstallPromptEvent | null) => {
    const standalone = readStandaloneFlags();
    setCapability(
      resolveInstallCapability({
        ...standalone,
        userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
        hasDeferredPrompt: prompt !== null,
      }),
    );
  }, []);

  useEffect(() => {
    deferredPromptRef.current = deferredPrompt;
  }, [deferredPrompt]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const bip = event as BeforeInstallPromptEvent;
      deferredPromptRef.current = bip;
      setDeferredPrompt(bip);
      setPromptOutcome(null);
      setCapability(
        resolveInstallCapability({
          ...readStandaloneFlags(),
          userAgent: navigator.userAgent,
          hasDeferredPrompt: true,
        }),
      );
    };

    const onInstalled = () => {
      deferredPromptRef.current = null;
      setDeferredPrompt(null);
      setPromptOutcome('accepted');
      setCapability('installed');
    };

    const media = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = () => {
      setCapability(
        resolveInstallCapability({
          ...readStandaloneFlags(),
          userAgent: navigator.userAgent,
          hasDeferredPrompt: deferredPromptRef.current !== null,
        }),
      );
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    media.addEventListener('change', onDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      media.removeEventListener('change', onDisplayModeChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallPromptOutcome> => {
    const prompt = deferredPromptRef.current;
    if (!prompt) {
      setPromptOutcome('unavailable');
      return 'unavailable';
    }

    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      deferredPromptRef.current = null;
      setDeferredPrompt(null);
      if (choice.outcome === 'accepted') {
        setPromptOutcome('accepted');
        setCapability('installed');
        return 'accepted';
      }
      setPromptOutcome('dismissed');
      recompute(null);
      return 'dismissed';
    } catch {
      setPromptOutcome('error');
      return 'error';
    } finally {
      setInstalling(false);
    }
  }, [recompute]);

  return {
    capability,
    installing,
    promptOutcome,
    promptInstall,
  };
}
