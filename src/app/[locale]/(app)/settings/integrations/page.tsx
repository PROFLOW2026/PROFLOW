import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listAccountingIntegrations } from '@/modules/integrations';
import { getOrgInvoicingSettings } from '@/modules/invoicing-integration';
import { isSumitTransactionInvoiceSupported } from '@/modules/invoicing-integration/providers/sumit/sumit-create-payload';
import { getSumitConnectionStatus } from '@/modules/invoicing-integration/server';
import { getOrgExpenseIngestionSettings } from '@/modules/expense-ingestion/server';
import { isOcrIngestionEnabled } from '@/modules/ocr/domain/feature-gate';
import { IntegrationsSettingsBody } from './integrations-settings-body';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('integrations');
}

export default async function IntegrationsSettingsPage() {
  const t = await getTranslations('integrations');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'integrations');

  const data = await withOrgContext(async (context) => {
    if (section && !canAccessSection(context, section)) return { allowed: false as const };
    try {
      const listed = await listAccountingIntegrations(context);
      const sumit = await getSumitConnectionStatus(context);
      const invoicingSettings = await getOrgInvoicingSettings(context);
      const expenseIngestion = await getOrgExpenseIngestionSettings(context);
      const canManageSumit = context.permissions.has(PERMISSIONS.SETTINGS_MANAGE);
      return {
        allowed: true as const,
        ...listed,
        sumit,
        invoicingSettings,
        expenseIngestion,
        ocrLive: isOcrIngestionEnabled(),
        canManageSumit,
      };
    } catch {
      return {
        allowed: true as const,
        catalog: [],
        mappingCount: 0,
        syncJobs: [],
        adapterConnected: false as const,
        canManage: false,
        sumit: { connected: false, companyId: null, providerId: null },
        invoicingSettings: {
          mode: 'manual' as const,
          paymentDocumentPolicy: 'tax_invoice_then_receipt' as const,
          receiptIssuance: 'automatic' as const,
        },
        expenseIngestion: { provider: 'none' as const },
        ocrLive: false,
        canManageSumit: false,
      };
    }
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={t('title')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={t('title')}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
        <IntegrationsSettingsBody
          key={data.invoicingSettings.mode}
          invoicingSettings={data.invoicingSettings}
          canManage={data.canManageSumit}
          transactionInvoiceSupported={isSumitTransactionInvoiceSupported()}
          sumit={{
            connected: data.sumit.connected,
            companyId: data.sumit.companyId,
          }}
          expenseIngestionProvider={data.expenseIngestion?.provider ?? 'none'}
          ocrLive={data.ocrLive ?? false}
        />
        {data.catalog.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {data.catalog.map((item) => (
              <li key={item.providerKey}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t(`providers.${item.providerKey}`)}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-[var(--pf-text-secondary)]">
                    <p>{t(`status.${item.status}`)}</p>
                    <p>{t('neverConnected')}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </SettingsPageShell>
  );
}
