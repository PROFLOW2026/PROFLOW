import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportDownloadButton } from '@/components/patterns/export-download-button';
import enCommon from '@/locales/en/common.json';
import heCommon from '@/locales/he-IL/common.json';
import enExports from '@/locales/en/exports.json';
import heExports from '@/locales/he-IL/exports.json';

function renderExport(ui: ReactElement, locale: 'en' | 'he-IL' = 'he-IL'): RenderResult {
  const messages = {
    common: locale === 'he-IL' ? heCommon : enCommon,
    exports: locale === 'he-IL' ? heExports : enExports,
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Jerusalem">
        {children}
      </NextIntlClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}

describe('ExportDownloadButton pending / success feedback', () => {
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

  it('shows Hebrew preparing copy while the fetch is in flight', async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => fetchPromise),
    );

    renderExport(
      <ExportDownloadButton href="/exports/projects">ייצוא פרויקטים</ExportDownloadButton>,
    );

    await user.click(screen.getByRole('button', { name: 'ייצוא פרויקטים' }));

    const busy = await screen.findByRole('button', { name: heExports.feedback.preparing });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toBeDisabled();
    expect(screen.getAllByText(heExports.feedback.preparing).length).toBeGreaterThanOrEqual(1);

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
      expect(screen.getByRole('button', { name: 'ייצוא פרויקטים' })).not.toHaveAttribute(
        'aria-busy',
      );
    });
    expect(await screen.findByText(heExports.feedback.ready)).toBeVisible();
  });

  it('uses English preparing / ready strings for en locale', async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => fetchPromise),
    );

    renderExport(
      <ExportDownloadButton href="/exports/clients">Export clients</ExportDownloadButton>,
      'en',
    );

    await user.click(screen.getByRole('button', { name: 'Export clients' }));
    expect(
      (await screen.findAllByText(enExports.feedback.preparing)).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('status')).toHaveTextContent(enExports.feedback.preparing);

    resolveFetch(
      new Response('ok', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="clients.csv"',
        },
      }),
    );

    // Wait for the toast message to change - findByRole('status') alone matches the
    // still-open preparing toast before the success update commits.
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(enExports.feedback.ready);
    });
  });

  it('surfaces forbidden feedback for HTTP 403', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 403 })),
    );

    renderExport(
      <ExportDownloadButton href="/exports/projects">ייצוא</ExportDownloadButton>,
    );

    await user.click(screen.getByRole('button', { name: 'ייצוא' }));
    expect(await screen.findByText(heExports.feedback.forbidden)).toBeVisible();
  });

  it('surfaces failed feedback for unexpected HTTP errors', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    renderExport(
      <ExportDownloadButton href="/exports/projects">ייצוא</ExportDownloadButton>,
    );

    await user.click(screen.getByRole('button', { name: 'ייצוא' }));
    expect(await screen.findByText(heExports.feedback.failed)).toBeVisible();
  });
});
