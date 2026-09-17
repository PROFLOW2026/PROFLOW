/**
 * Pure PWA installability helpers (no browser globals).
 * UI maps capability → install CTA, installed state, or manual instructions.
 */

export type InstallCapability =
  | 'installed'
  | 'prompt_available'
  | 'manual_ios'
  /** Chromium desktop/Android before `beforeinstallprompt` or when only menu install exists. */
  | 'manual_browser'
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

/** Desktop/Android Chromium-family browsers that support PWA install (menu or BIP). */
export function isChromiumInstallBrowser(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  const chromium =
    /chrome|crios|crmo/.test(ua) || /edg\//.test(ua) || /samsungbrowser/.test(ua);
  const excluded = /firefox|fxios|opr\//.test(ua);
  return chromium && !excluded;
}

export function resolveInstallCapability(env: InstallEnvironmentSnapshot): InstallCapability {
  if (isStandaloneDisplay(env)) return 'installed';
  if (env.hasDeferredPrompt) return 'prompt_available';
  if (isIosInstallManual(env.userAgent)) return 'manual_ios';
  if (isChromiumInstallBrowser(env.userAgent)) return 'manual_browser';
  return 'unavailable';
}

/** Outcomes from a user-gesture install prompt. */
export type InstallPromptOutcome = 'accepted' | 'dismissed' | 'error' | 'unavailable';
