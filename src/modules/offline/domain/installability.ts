/**
 * Pure PWA installability helpers (no browser globals).
 * UI maps capability → install CTA, installed state, or manual instructions.
 */

export type InstallCapability =
  | 'installed'
  | 'prompt_available'
  | 'manual_ios'
  | 'unavailable';

export interface InstallEnvironmentSnapshot {
  readonly displayModeStandalone: boolean;
  /** iOS Safari legacy flag (`navigator.standalone`). */
  readonly iosNavigatorStandalone: boolean;
  readonly userAgent: string;
  readonly hasDeferredPrompt: boolean;
}

/** True when the app is already running as an installed shell. */
export function isStandaloneDisplay(env: {
  readonly displayModeStandalone: boolean;
  readonly iosNavigatorStandalone: boolean;
}): boolean {
  return env.displayModeStandalone || env.iosNavigatorStandalone;
}

/**
 * iPhone/iPad/iPod browsers that need Share → Add to Home Screen
 * (no `beforeinstallprompt`).
 */
export function isIosInstallManual(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  const iosDevice = /iphone|ipad|ipod/.test(ua);
  // iPadOS 13+ may report as Macintosh with touch.
  const ipadDesktopUa = ua.includes('macintosh') && ua.includes('mobile');
  return iosDevice || ipadDesktopUa;
}

export function resolveInstallCapability(env: InstallEnvironmentSnapshot): InstallCapability {
  if (isStandaloneDisplay(env)) return 'installed';
  if (env.hasDeferredPrompt) return 'prompt_available';
  if (isIosInstallManual(env.userAgent)) return 'manual_ios';
  return 'unavailable';
}

/** Outcomes from a user-gesture install prompt. */
export type InstallPromptOutcome = 'accepted' | 'dismissed' | 'error' | 'unavailable';
