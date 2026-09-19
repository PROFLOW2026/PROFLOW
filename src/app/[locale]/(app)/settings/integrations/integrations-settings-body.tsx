'use client';

import { useState } from 'react';
import type { ExpenseIngestionProvider } from '@/modules/expense-ingestion';
import type { OrgInvoicingSettings } from '@/modules/invoicing-integration/domain/org-invoicing-settings';
import { InvoicingSettingsPanel } from './invoicing-settings-panel';
import { SumitIntegrationPanel } from './sumit-panel';

export interface IntegrationsSettingsBodyProps {
  invoicingSettings: OrgInvoicingSettings;
  canManage: boolean;
  transactionInvoiceSupported: boolean;
  sumit: {
    connected: boolean;
    companyId: number | null;
  };
  expenseIngestionProvider: ExpenseIngestionProvider;
  ocrLive: boolean;
}

export function IntegrationsSettingsBody({
  invoicingSettings,
  canManage,
  transactionInvoiceSupported,
  sumit,
  expenseIngestionProvider,
  ocrLive,
}: IntegrationsSettingsBodyProps) {
  const [mode, setMode] = useState(invoicingSettings.mode);
  const accountingMode = mode === 'external_provider';

  return (
    <>
      <InvoicingSettingsPanel
        settings={invoicingSettings}
        mode={mode}
        canManage={canManage}
        transactionInvoiceSupported={transactionInvoiceSupported}
        providerConnected={sumit.connected}
        onModeChange={setMode}
      />
      {accountingMode ? (
        <SumitIntegrationPanel
          connected={sumit.connected}
          companyId={sumit.companyId}
          canManage={canManage}
          expenseIngestionProvider={expenseIngestionProvider}
          ocrLive={ocrLive}
        />
      ) : null}
    </>
  );
}
