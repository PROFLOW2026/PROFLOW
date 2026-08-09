import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExportDownloadControl,
} from '@/modules/exports/ui/export-download-control';
import enExports from '@/locales/en/exports.json';
import heExports from '@/locales/he-IL/exports.json';

function renderControl(ui: ReactElement, locale: 'en' | 'he-IL' = 'he-IL') {
  const messages = { exports: locale === 'he-IL' ? heExports : enExports };

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Jerusalem">
        {children}
      </NextIntlClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}

describe('ExportDownloadControl (reports path)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'URL',
      class {
        static createObjectURL = vi.fn(() => 'blob:mock');
        static revokeObjectURL = vi.fn();
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows preparing then ready feedback from exports.feedback locales', async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    renderControl(
      <ExportDownloadControl href="/exports/projects">ייצוא פרויקטים</ExportDownloadControl>,
    );

    await user.click(screen.getByRole('button', { name: 'ייצוא פרויקטים' }));
    expect(await screen.findByText(heExports.feedback.preparing)).toBeVisible();
    expect(screen.getByRole('button', { name: 'ייצוא פרויקטים' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    resolveFetch(
      new Response('id,name\n1,x', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="projects.csv"',
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(heExports.feedback.ready)).toBeVisible();
    });
  });
});
