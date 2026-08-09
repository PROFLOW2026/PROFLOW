import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PwaInstallCta } from '@/modules/offline/ui/pwa-install-cta';
import enOffline from '@/locales/en/offline.json';
import heOffline from '@/locales/he-IL/offline.json';
import {
  initPwaInstallPromptCapture,
  resetPwaInstallPromptCaptureForTests,
  type BeforeInstallPromptEvent,
} from '@/modules/offline/ui/pwa-install-prompt-capture';

const matchMediaState = vi.hoisted(() => ({ standalone: false }));

function renderCta(ui: ReactElement, locale: 'en' | 'he-IL' = 'he-IL') {
  const messages = { offline: locale === 'he-IL' ? heOffline : enOffline };
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Jerusalem">
        {children}
      </NextIntlClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}

function fireBip(): BeforeInstallPromptEvent {
  const bip = {
    preventDefault: vi.fn(),
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  };
  window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), bip));
  return bip as unknown as BeforeInstallPromptEvent;
}

describe('PwaInstallCta', () => {
  beforeEach(() => {
    matchMediaState.standalone = false;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('standalone') ? matchMediaState.standalone : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    resetPwaInstallPromptCaptureForTests();
    initPwaInstallPromptCapture();
  });

  afterEach(() => {
    resetPwaInstallPromptCaptureForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders nothing while install is unavailable (no false claim)', () => {
    const { container } = renderCta(<PwaInstallCta variant="auth" />);
    expect(container.querySelector('[data-pf-pwa-install-cta]')).toBeNull();
  });

  it('shows Hebrew short CTA when beforeinstallprompt is captured', async () => {
    fireBip();
    renderCta(<PwaInstallCta variant="auth" />, 'he-IL');
    expect(await screen.findByRole('button', { name: heOffline.install.shortCta })).toBeVisible();
  });

  it('shows English short CTA for en locale', async () => {
    fireBip();
    renderCta(<PwaInstallCta variant="dashboard" />, 'en');
    expect(await screen.findByRole('button', { name: enOffline.install.shortCta })).toBeVisible();
  });

  it('invokes native prompt() on click', async () => {
    const user = userEvent.setup();
    const bip = fireBip();
    renderCta(<PwaInstallCta variant="dashboard" />, 'en');
    await user.click(await screen.findByRole('button', { name: enOffline.install.shortCta }));
    expect(bip.prompt).toHaveBeenCalledTimes(1);
  });

  it('hides CTA in standalone / installed mode', () => {
    matchMediaState.standalone = true;
    fireBip();
    const { container } = renderCta(<PwaInstallCta variant="dashboard" />);
    expect(container.querySelector('[data-pf-pwa-install-cta]')).toBeNull();
  });

  it('shows iOS instructions CTA instead of a fake direct install button', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    renderCta(<PwaInstallCta variant="auth" />, 'he-IL');
    const button = await screen.findByRole('button', { name: heOffline.install.iosCta });
    expect(button).toBeVisible();
    await user.click(button);
    expect(screen.getByText(heOffline.install.iosStepShare)).toBeVisible();
  });
});
