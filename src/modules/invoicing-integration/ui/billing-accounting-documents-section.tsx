import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import type { StorageProviderKey } from '@/modules/external-storage/server';
import {
  isAccountingInvoicingMode,
  isCollectionOnlyMode,
  resolveAccountingProviderDisplayName,
} from '../domain/collection-mode';
import type { OrgInvoicingSettings } from '../domain/org-invoicing-settings';
import type { ExternalStatutoryDocument, StatutoryProviderStatus } from '../domain/types';
import { ExternalStatutoryPanel } from './external-statutory-panel';

export interface BillingAccountingDocumentsSectionProps {
  settings: OrgInvoicingSettings;
  billingRecordId: string;
  billingStatus: 'draft' | 'finalized' | 'void';
  canManage: boolean;
  providerStatus: StatutoryProviderStatus;
  documents: readonly ExternalStatutoryDocument[];
  hasCustomerSnapshot: boolean;
  customerEmail: string | null;
  primaryStorageProvider: StorageProviderKey | null;
  accountingUiEnabled: boolean;
}

function hasHistoricalDocuments(documents: readonly ExternalStatutoryDocument[]): boolean {
  return documents.some(
    (doc) => doc.issuanceOutcome === 'confirmed_created' || Boolean(doc.externalId),
  );
}

export async function BillingAccountingDocumentsSection({
  settings,
  billingRecordId,
  billingStatus,
  canManage,
  providerStatus,
  documents,
  hasCustomerSnapshot,
  customerEmail,
  primaryStorageProvider,
  accountingUiEnabled,
}: BillingAccountingDocumentsSectionProps) {
  const t = await getTranslations('invoicingIntegration.accountingSection');
  const providerName = resolveAccountingProviderDisplayName(providerStatus.providerId);

  if (isCollectionOnlyMode(settings)) {
    if (!hasHistoricalDocuments(documents)) return null;
    return (
      <ExternalStatutoryPanel
        variant="historical"
        billingRecordId={billingRecordId}
        billingStatus={billingStatus}
        canManage={false}
        providerStatus={providerStatus}
        documents={documents}
        hasCustomerSnapshot={hasCustomerSnapshot}
        customerEmail={customerEmail}
        primaryStorageProvider={primaryStorageProvider}
        providerDisplayName={providerName}
      />
    );
  }

  if (isAccountingInvoicingMode(settings) && !accountingUiEnabled) {
    return (
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-start text-base">{t('title')}</CardTitle>
          <p className="text-start text-sm text-[var(--pf-text-secondary)]">{t('connectPrompt')}</p>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary" size="sm">
            <Link href="/settings/integrations">{t('connectAction')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!accountingUiEnabled) return null;

  return (
    <>
      {providerName ? (
        <Alert tone="success" role="status">
          {t('providerConnected', { provider: providerName })}
        </Alert>
      ) : null}
      <ExternalStatutoryPanel
        variant="active"
        billingRecordId={billingRecordId}
        billingStatus={billingStatus}
        canManage={canManage}
        providerStatus={providerStatus}
        documents={documents}
        hasCustomerSnapshot={hasCustomerSnapshot}
        customerEmail={customerEmail}
        primaryStorageProvider={primaryStorageProvider}
        providerDisplayName={providerName}
      />
    </>
  );
}
