import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StatusToast } from '@/components/ui/status-toast';
import enCommon from '@/locales/en/common.json';

function renderToast(ui: ReactElement) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider
        locale="en"
        messages={{ common: enCommon }}
        timeZone="Asia/Jerusalem"
      >
        {children}
      </NextIntlClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}

describe('StatusToast', () => {
  it('renders nothing when closed', () => {
    renderToast(<StatusToast open={false} tone="info" message="Hidden" />);
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('portals an info status message when open', () => {
    renderToast(<StatusToast open tone="info" message="Preparing…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing…');
  });

  it('uses alert role for danger tone and supports dismiss', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderToast(
      <StatusToast open tone="danger" message="Export failed" onDismiss={onDismiss} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Export failed');
    await user.click(screen.getByRole('button', { name: enCommon.actions.close }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
