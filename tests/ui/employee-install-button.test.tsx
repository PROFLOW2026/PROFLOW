import { screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { EmployeeInstallButton } from '@/modules/employee-app/ui/employee-install-button';
import heEmployeeApp from '@/locales/he-IL/employeeApp.json';
import heOffline from '@/locales/he-IL/offline.json';
import {
  initPwaInstallPromptCapture,
  resetPwaInstallPromptCaptureForTests,
  type BeforeInstallPromptEvent,
} from '@/modules/offline/ui/pwa-install-prompt-capture';

const matchMediaState = vi.hoisted(() => ({ standalone: false }));

function renderButton(ui: ReactElement) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider
        locale="he-IL"
        messages={{ employeeApp: heEmployeeApp, offline: heOffline }}
        timeZone="Asia/Jerusalem"
      >
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

describe('EmployeeInstallButton', () => {
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

  it('renders nothing before install is available', () => {
    const { container } = renderButton(<EmployeeInstallButton />);
    expect(container.firstChild).toBeNull();
  });

  it('shows compact Hebrew label using shared PwaInstallCta', async () => {
    fireBip();
    renderButton(<EmployeeInstallButton />);
    expect(
      await screen.findByRole('button', { name: heEmployeeApp.home.installApp }),
    ).toBeVisible();
  });

  it('hides when already installed', () => {
    matchMediaState.standalone = true;
    fireBip();
    const { container } = renderButton(<EmployeeInstallButton />);
    expect(container.firstChild).toBeNull();
  });
});
