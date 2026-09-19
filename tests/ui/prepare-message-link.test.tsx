import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import enCommunications from '@/locales/en/communications.json';
import { PrepareMessageLink } from '@/modules/communications/ui/prepare-message-link';

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ children, ...props }: { children: ReactNode; href: string }) => (
    <a {...props}>{children}</a>
  ),
}));

describe('PrepareMessageLink', () => {
  it('remains disabled by default on billing detail', () => {
    render(
      <NextIntlClientProvider locale="he-IL" messages={{ communications: enCommunications }} timeZone="Asia/Jerusalem">
        <PrepareMessageLink entityType="billing_record" entityId="billing-1" />
      </NextIntlClientProvider>,
    );

    const button = screen.getByRole('button', { name: enCommunications.prepareMessage });
    expect(button).toBeDisabled();
  });
});
