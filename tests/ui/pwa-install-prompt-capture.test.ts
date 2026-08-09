/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDeferredInstallPrompt,
  initPwaInstallPromptCapture,
  promptPwaInstall,
  resetPwaInstallPromptCaptureForTests,
  subscribePwaAppInstalled,
  subscribePwaInstallPrompt,
  type BeforeInstallPromptEvent,
} from '@/modules/offline/ui/pwa-install-prompt-capture';

function makeBip(outcome: 'accepted' | 'dismissed' = 'accepted'): BeforeInstallPromptEvent {
  return {
    preventDefault: vi.fn(),
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome }),
  } as unknown as BeforeInstallPromptEvent;
}

describe('pwa-install-prompt-capture (global BIP store)', () => {
  afterEach(() => {
    resetPwaInstallPromptCaptureForTests();
    vi.restoreAllMocks();
  });

  it('captures beforeinstallprompt once and shares the deferred event', () => {
    initPwaInstallPromptCapture();
    initPwaInstallPromptCapture(); // idempotent

    const listener = vi.fn();
    subscribePwaInstallPrompt(listener);

    const bip = makeBip();
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), bip));

    expect(getDeferredInstallPrompt()).toBeTruthy();
    expect(listener).toHaveBeenCalled();
  });

  it('invokes .prompt() from user gesture and clears the deferred event', async () => {
    initPwaInstallPromptCapture();
    const bip = makeBip('accepted');
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), bip));

    const outcome = await promptPwaInstall();
    expect(bip.prompt).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('accepted');
    expect(getDeferredInstallPrompt()).toBeNull();
  });

  it('returns dismissed without claiming installed', async () => {
    initPwaInstallPromptCapture();
    const bip = makeBip('dismissed');
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), bip));

    await expect(promptPwaInstall()).resolves.toBe('dismissed');
  });

  it('notifies appinstalled subscribers and clears the deferred prompt', () => {
    initPwaInstallPromptCapture();
    const bip = makeBip();
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), bip));

    const installed = vi.fn();
    subscribePwaAppInstalled(installed);
    window.dispatchEvent(new Event('appinstalled'));

    expect(installed).toHaveBeenCalled();
    expect(getDeferredInstallPrompt()).toBeNull();
  });

  it('returns unavailable when no deferred prompt is held', async () => {
    initPwaInstallPromptCapture();
    await expect(promptPwaInstall()).resolves.toBe('unavailable');
  });
});
