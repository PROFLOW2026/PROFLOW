import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import enInvoicing from '@/locales/en/invoicingIntegration.json';
import { FULL_ADAPTER_CAPABILITIES } from '@/modules/invoicing-integration/domain/types';
import { ExternalStatutoryPanel } from '@/modules/invoicing-integration/ui/external-statutory-panel';
import enCommon from '@/locales/en/common.json';

vi.mock('@/modules/invoicing-integration/ui/actions', () => ({
  createStatutoryShareLinkAction: vi.fn(),
  refreshExternalStatutoryStatusAction: vi.fn(),
  requestExternalStatutoryDocumentAction: vi.fn(),
  resolveStatutoryStorageLocationAction: vi.fn(),
  saveStatutoryPdfToStorageAction: vi.fn(),
  sendExternalStatutoryDocumentAction: vi.fn(),
}));

vi.mock('@/shared/i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const providerStatus = {
  providerId: 'sumit',
  configured: true,
  featureEnabled: true,
  messageKey: 'invoicingIntegration.status.providerConnected',
  capabilities: FULL_ADAPTER_CAPABILITIES,
};

describe('ExternalStatutoryPanel collection modes', () => {
  it('hides issuance controls in historical mode', () => {
    render(
      <NextIntlClientProvider locale="he-IL" messages={{ invoicingIntegration: enInvoicing, common: enCommon }} timeZone="Asia/Jerusalem">
        <ExternalStatutoryPanel
          variant="historical"
          billingRecordId="bill-1"
          billingStatus="finalized"
          canManage={false}
          providerStatus={providerStatus}
          documents={[
            {
              id: 'doc-1',
              billingRecordId: 'bill-1',
              paymentId: null,
              kind: 'tax_invoice',
              status: 'issued',
              externalId: '2376000043',
              externalNumber: '1000',
              issuanceOutcome: 'confirmed_created',
            } as never,
          ]}
          hasCustomerSnapshot
          customerEmail="client@example.com"
          primaryStorageProvider={null}
          providerDisplayName="SUMIT"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(enInvoicing.historical.title)).toBeInTheDocument();
    expect(screen.queryByText(enInvoicing.actions.requestDocument)).not.toBeInTheDocument();
    expect(screen.getByText(enInvoicing.actions.viewPdf)).toBeInTheDocument();
  });

  it('shows issuance request in active mode', () => {
    render(
      <NextIntlClientProvider locale="he-IL" messages={{ invoicingIntegration: enInvoicing, common: enCommon }} timeZone="Asia/Jerusalem">
        <ExternalStatutoryPanel
          variant="active"
          billingRecordId="bill-1"
          billingStatus="finalized"
          canManage
          providerStatus={providerStatus}
          documents={[]}
          hasCustomerSnapshot
          customerEmail="client@example.com"
          primaryStorageProvider={null}
          providerDisplayName="SUMIT"
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(enInvoicing.accountingSection.title)).toBeInTheDocument();
    expect(screen.getByText(enInvoicing.actions.requestDocument)).toBeInTheDocument();
  });
});
