import { describe, expect, it } from 'vitest';
import {
  isChromiumInstallBrowser,
  isIosInstallManual,
  isStandaloneDisplay,
  resolveInstallCapability,
} from '@/modules/offline/domain/installability';

describe('PWA install capability helpers', () => {
  it('detects standalone / installed shells', () => {
    expect(
      isStandaloneDisplay({ displayModeStandalone: true, iosNavigatorStandalone: false }),
    ).toBe(true);
    expect(
      isStandaloneDisplay({ displayModeStandalone: false, iosNavigatorStandalone: true }),
    ).toBe(true);
    expect(
      isStandaloneDisplay({ displayModeStandalone: false, iosNavigatorStandalone: false }),
    ).toBe(false);
  });

  it('flags iOS Safari for manual Add to Home Screen', () => {
    expect(isIosInstallManual('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosInstallManual('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toBe(true);
    expect(isIosInstallManual('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Mobile')).toBe(true);
    expect(isIosInstallManual('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe(false);
  });

  it('detects Chromium install browsers', () => {
    expect(isChromiumInstallBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe(true);
    expect(isChromiumInstallBrowser('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile')).toBe(true);
    expect(isChromiumInstallBrowser('Mozilla/5.0 Firefox/120')).toBe(false);
  });

  it('resolves capability precedence: installed > prompt > ios manual > chromium manual > unavailable', () => {
    expect(
      resolveInstallCapability({
        displayModeStandalone: true,
        iosNavigatorStandalone: false,
        userAgent: 'iPhone',
        hasDeferredPrompt: true,
      }),
    ).toBe('installed');

    expect(
      resolveInstallCapability({
        displayModeStandalone: false,
        iosNavigatorStandalone: false,
        userAgent: 'Chrome',
        hasDeferredPrompt: true,
      }),
    ).toBe('prompt_available');

    expect(
      resolveInstallCapability({
        displayModeStandalone: false,
        iosNavigatorStandalone: false,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        hasDeferredPrompt: false,
      }),
    ).toBe('manual_ios');

    expect(
      resolveInstallCapability({
        displayModeStandalone: false,
        iosNavigatorStandalone: false,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
        hasDeferredPrompt: false,
      }),
    ).toBe('manual_browser');

    expect(
      resolveInstallCapability({
        displayModeStandalone: false,
        iosNavigatorStandalone: false,
        userAgent: 'Mozilla/5.0 Firefox/120',
        hasDeferredPrompt: false,
      }),
    ).toBe('unavailable');
  });
});
