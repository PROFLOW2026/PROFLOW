/**
 * Module-level `beforeinstallprompt` capture (LEO KIDS pattern).
 *
 * Chrome fires BIP once when installability criteria are met - typically soon
 * after the SW activates, often long before the user opens Settings → App.
 * Listeners mounted only on `/settings/app` miss the event and permanently
 * show capability `unavailable` for that browsing session.
 */

export interface BeforeInstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type PromptListener = () => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let captureInitialized = false;
const promptListeners = new Set<PromptListener>();
const installedListeners = new Set<PromptListener>();

function notify(listeners: Set<PromptListener>): void {
  listeners.forEach((listener) => listener());
}

function handleBeforeInstallPrompt(event: Event): void {
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  notify(promptListeners);
}

function handleAppInstalled(): void {
  deferredPrompt = null;
  notify(installedListeners);
  notify(promptListeners);
}

/** Idempotent. Safe to call from any client mount (layout / settings / tests). */
export function initPwaInstallPromptCapture(): void {
  if (typeof window === 'undefined') return;
  if (captureInitialized) return;
  captureInitialized = true;
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function subscribePwaInstallPrompt(listener: PromptListener): () => void {
  promptListeners.add(listener);
  return () => {
    promptListeners.delete(listener);
  };
}

export function subscribePwaAppInstalled(listener: PromptListener): () => void {
  installedListeners.add(listener);
  return () => {
    installedListeners.delete(listener);
  };
}

export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable' | 'error'> {
  const prompt = deferredPrompt;
  if (!prompt) return 'unavailable';

  deferredPrompt = null;
  notify(promptListeners);

  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    notify(promptListeners);
    return choice.outcome;
  } catch {
    notify(promptListeners);
    return 'error';
  }
}

/** Test / HMR helper - do not call from product UI. */
export function resetPwaInstallPromptCaptureForTests(): void {
  if (typeof window !== 'undefined' && captureInitialized) {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.removeEventListener('appinstalled', handleAppInstalled);
  }
  deferredPrompt = null;
  captureInitialized = false;
  promptListeners.clear();
  installedListeners.clear();
}
