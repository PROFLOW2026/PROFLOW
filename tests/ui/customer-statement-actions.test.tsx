import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import enReports from '@/locales/en/reports.json';
import enCommunications from '@/locales/en/communications.json';
import { CustomerStatementActions } from '@/modules/reports/ui/customer-statement-actions';
import { buildWhatsAppShareUrl } from '@/modules/communications/domain/whatsapp-share';

vi.mock('@/modules/generated-documents/ui/save-to-storage-button', () => ({
  SaveToStorageButton: () => <button type="button">Save to storage</button>,
}));

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('CustomerStatementActions', () => {
  it('renders preview, share, copy, whatsapp, and prepare message', () => {
    render(
      <NextIntlClientProvider
        locale="he-IL"
        messages={{ reports: enReports, communications: enCommunications }}
        timeZone="Asia/Jerusalem"
      >
        <CustomerStatementActions
          clientId="client-1"
          clientName="Demo Client"
          clientEmail="client@example.com"
          clientPhone="+972501234567"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('link', { name: enReports.customerStatement.preview })).toHaveAttribute(
      'href',
      '/reports/preview?kind=customer_statement&id=client-1',
    );
    expect(screen.getByRole('button', { name: enReports.customerStatement.shareButton })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: enReports.customerStatement.copyLink })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: enReports.customerStatement.whatsapp })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: enCommunications.prepareMessage })).toHaveAttribute(
      'href',
      expect.stringContaining('entityType=report'),
    );
    expect(screen.getByRole('link', { name: enCommunications.prepareMessage })).toHaveAttribute(
      'href',
      expect.stringContaining('clientId=client-1'),
    );
  });

  it('builds WhatsApp message from translations', () => {
    const link = 'https://app.example.com/he-IL/reports/preview?kind=customer_statement&id=client-1';
    const message = enReports.customerStatement.share.messageTemplate
      .replace('{clientName}', 'Demo Client')
      .replace('{link}', link);
    const url = buildWhatsAppShareUrl({ phone: '+972501234567', message });
    expect(url).toContain('972501234567');
    expect(url).toContain(encodeURIComponent('Demo Client'));
  });

  it('disables prepare message when communication permission is missing', () => {
    render(
      <NextIntlClientProvider
        locale="he-IL"
        messages={{ reports: enReports, communications: enCommunications }}
        timeZone="Asia/Jerusalem"
      >
        <CustomerStatementActions clientId="client-1" clientName="Demo Client" canCommunicate={false} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('button', { name: enCommunications.prepareMessage })).toBeDisabled();
  });
});
