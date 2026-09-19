import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { IntegrationsSettingsBody } from '@/app/[locale]/(app)/settings/integrations/integrations-settings-body';
import enInvoicing from '@/locales/en/invoicingIntegration.json';

vi.mock('@/app/[locale]/(app)/settings/integrations/sumit-panel', () => ({
  SumitIntegrationPanel: () => <div data-testid="sumit-panel">SUMIT panel</div>,
}));

vi.mock('@/app/[locale]/(app)/settings/integrations/invoicing-settings-actions', () => ({
  saveInvoicingSettingsAction: vi.fn(),
}));

function renderBody(
  settings: {
    mode: 'manual' | 'external_provider';
    paymentDocumentPolicy: 'tax_invoice_then_receipt';
    receiptIssuance: 'automatic';
  },
  providerConnected = false,
) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ invoicingIntegration: enInvoicing }}
      timeZone="Asia/Jerusalem"
    >
      <IntegrationsSettingsBody
        invoicingSettings={settings}
        canManage
        transactionInvoiceSupported={false}
        sumit={{ connected: providerConnected, companyId: null }}
        expenseIngestionProvider="none"
        ocrLive={false}
      />
    </NextIntlClientProvider>,
  );
}

describe('IntegrationsSettingsBody', () => {
  it('always renders the mode selector title', () => {
    renderBody({
      mode: 'manual',
      paymentDocumentPolicy: 'tax_invoice_then_receipt',
      receiptIssuance: 'automatic',
    });

    expect(screen.getByText(enInvoicing.settings.title)).toBeInTheDocument();
    expect(screen.getByLabelText(enInvoicing.settings.modeManual)).toBeChecked();
  });

  it('hides provider panel in manual mode', () => {
    renderBody({
      mode: 'manual',
      paymentDocumentPolicy: 'tax_invoice_then_receipt',
      receiptIssuance: 'automatic',
    });

    expect(screen.queryByTestId('sumit-panel')).not.toBeInTheDocument();
  });

  it('shows provider panel when accounting mode is selected', () => {
    renderBody({
      mode: 'manual',
      paymentDocumentPolicy: 'tax_invoice_then_receipt',
      receiptIssuance: 'automatic',
    });

    fireEvent.click(screen.getByLabelText(enInvoicing.settings.modeExternal));
    expect(screen.getByTestId('sumit-panel')).toBeInTheDocument();
    expect(screen.getByText(enInvoicing.settings.providerNotConnected)).toBeInTheDocument();
  });

  it('shows connected provider status in accounting mode', () => {
    renderBody(
      {
        mode: 'external_provider',
        paymentDocumentPolicy: 'tax_invoice_then_receipt',
        receiptIssuance: 'automatic',
      },
      true,
    );

    expect(screen.getByText('SUMIT — Connected')).toBeInTheDocument();
    expect(screen.getByTestId('sumit-panel')).toBeInTheDocument();
  });
});
