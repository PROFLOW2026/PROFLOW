import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { EmployeePwaInstall } from '@/modules/employee-app/ui/employee-pwa-install';
import heEmployeeApp from '@/locales/he-IL/employeeApp.json';
import {
  initPwaInstallPromptCapture,
  resetPwaInstallPromptCaptureForTests,
  type BeforeInstallPromptEvent,
} from '@/modules/offline/ui/pwa-install-prompt-capture';

const matchMediaState = vi.hoisted(() => ({ standalone: false }));

function renderInstall(ui: ReactElement) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale="he-IL" messages={{ employeeApp: heEmployeeApp }} timeZone="Asia/Jerusalem">
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

describe('EmployeePwaInstall', () => {
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

  it('shows install card even before beforeinstallprompt fires', async () => {
    renderInstall(<EmployeePwaInstall />);
    expect(await screen.findByRole('heading', { name: heEmployeeApp.install.title })).toBeVisible();
    expect(screen.getByRole('button', { name: heEmployeeApp.install.cta })).toBeVisible();
  });

  it('shows Hebrew install card when beforeinstallprompt is captured', async () => {
    fireBip();
    renderInstall(<EmployeePwaInstall />);
    expect(await screen.findByRole('heading', { name: heEmployeeApp.install.title })).toBeVisible();
    expect(screen.getByRole('button', { name: heEmployeeApp.install.cta })).toBeVisible();
  });

  it('opens iOS instruction sheet on iPhone user agents', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    renderInstall(<EmployeePwaInstall />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: heEmployeeApp.install.cta }));
    expect(await screen.findByText(heEmployeeApp.install.iosTitle)).toBeVisible();
    expect(screen.getByText(heEmployeeApp.install.iosStepShare)).toBeVisible();
  });

  it('shows installed message in standalone mode', async () => {
    matchMediaState.standalone = true;
    fireBip();
    renderInstall(<EmployeePwaInstall />);
    expect(await screen.findByRole('heading', { name: heEmployeeApp.install.installedTitle })).toBeVisible();
  });

  it('opens manual install sheet on desktop Chrome without BIP', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    renderInstall(<EmployeePwaInstall />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: heEmployeeApp.install.cta }));
    expect(await screen.findByText(heEmployeeApp.install.manualTitle)).toBeVisible();
  });
});
