'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MoneyText } from '@/components/patterns/money-text';
import type {
  ExternalStatutoryDocument,
  ReconciliationStatus,
  StatutoryProviderStatus,
} from '../domain/types';
import {
  refreshExternalStatutoryStatusAction,
  requestExternalStatutoryDocumentAction,
} from './actions';

export interface ExternalStatutoryPanelProps {
  billingRecordId: string;
  billingStatus: 'draft' | 'finalized' | 'void';
  canManage: boolean;
  providerStatus: StatutoryProviderStatus;
  documents: readonly ExternalStatutoryDocument[];
  hasCustomerSnapshot: boolean;
}

function reconciliationTone(
  status: ReconciliationStatus | null | undefined,
): 'success' | 'warning' | 'neutral' {
  if (status === 'matched') return 'success';
  if (status === 'mismatch') return 'warning';
  return 'neutral';
}

export function ExternalStatutoryPanel({
  billingRecordId,
  billingStatus,
  canManage,
  providerStatus,
  documents,
  hasCustomerSnapshot,
}: ExternalStatutoryPanelProps) {
  const t = useTranslations('invoicingIntegration');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const taxInvoice = documents.find((doc) => doc.kind === 'tax_invoice') ?? null;
  const blocking =
    taxInvoice &&
    (taxInvoice.issuanceOutcome === 'in_flight' ||
      taxInvoice.issuanceOutcome === 'ambiguous' ||
      taxInvoice.issuanceOutcome === 'confirmed_created');

  const canRequest =
    canManage &&
    providerStatus.featureEnabled &&
    billingStatus === 'finalized' &&
    hasCustomerSnapshot &&
    !blocking;

  function run(action: () => Promise<{ error?: string; ok?: boolean }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-start text-base">{t('title')}</CardTitle>
        <p className="text-start text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-start">
        <p className="text-xs text-[var(--pf-text-muted)]">{t('separation.disclosure')}</p>

        {!providerStatus.featureEnabled ? (
          <Alert tone="warning">{t(providerStatus.messageKey)}</Alert>
        ) : (
          <Alert tone="success">{t('status.providerConnected')}</Alert>
        )}

        {billingStatus !== 'finalized' ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('errors.billingNotFinalized')}</p>
        ) : null}

        {!hasCustomerSnapshot && billingStatus === 'finalized' ? (
          <Alert tone="warning">{t('errors.missingCustomerSnapshot')}</Alert>
        ) : null}

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {taxInvoice?.reconciliationStatus === 'mismatch' ? (
          <Alert tone="warning">{t('reconciliation.mismatchBanner')}</Alert>
        ) : null}

        {taxInvoice ? (
          <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{t('separation.externalDocument')}</span>
                <Badge tone="neutral">{t(`documentStatus.${taxInvoice.status}`)}</Badge>
                {taxInvoice.reconciliationStatus ? (
                  <Badge tone={reconciliationTone(taxInvoice.reconciliationStatus)}>
                    {t(`reconciliation.status.${taxInvoice.reconciliationStatus}`)}
                  </Badge>
                ) : null}
              </div>
              {taxInvoice.externalId && canManage ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      refreshExternalStatutoryStatusAction(taxInvoice.id, billingRecordId),
                    )
                  }
                >
                  {t('actions.refreshStatus')}
                </Button>
              ) : null}
            </div>

            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[var(--pf-text-secondary)]">{t('fields.provider')}</dt>
                <dd>SUMIT</dd>
              </div>
              {taxInvoice.externalNumber ? (
                <div>
                  <dt className="text-[var(--pf-text-secondary)]">{t('fields.externalNumber')}</dt>
                  <dd dir="ltr" className="pf-numeric">
                    {taxInvoice.externalNumber}
                  </dd>
                </div>
              ) : null}
              {taxInvoice.externalId ? (
                <div>
                  <dt className="text-[var(--pf-text-secondary)]">DocumentID</dt>
                  <dd dir="ltr" className="pf-numeric break-all">
                    {taxInvoice.externalId}
                  </dd>
                </div>
              ) : null}
              {taxInvoice.externalUrl ? (
                <div className="sm:col-span-2">
                  <dt className="text-[var(--pf-text-secondary)]">{t('fields.externalUrl')}</dt>
                  <dd>
                    <a
                      href={taxInvoice.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--pf-accent)] underline"
                    >
                      {t('actions.viewInProvider')}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>

            {taxInvoice.reconciliationMetadata ? (
              <div className="mt-4 rounded-md bg-[var(--pf-bg-subtle)] p-3 text-sm">
                <p className="font-medium">{t('reconciliation.title')}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div>
                    <p className="text-[var(--pf-text-secondary)]">{t('reconciliation.expectedNet')}</p>
                    <MoneyText
                      value={{
                        amount: taxInvoice.reconciliationMetadata.expectedNet,
                        currency: taxInvoice.reconciliationMetadata.currency,
                      }}
                    />
                  </div>
                  <div>
                    <p className="text-[var(--pf-text-secondary)]">{t('reconciliation.expectedVat')}</p>
                    <MoneyText
                      value={{
                        amount: taxInvoice.reconciliationMetadata.expectedVat ?? '0',
                        currency: taxInvoice.reconciliationMetadata.currency,
                      }}
                    />
                  </div>
                  <div>
                    <p className="text-[var(--pf-text-secondary)]">{t('reconciliation.expectedGross')}</p>
                    <MoneyText
                      value={{
                        amount: taxInvoice.reconciliationMetadata.expectedGross,
                        currency: taxInvoice.reconciliationMetadata.currency,
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {taxInvoice.lastErrorMessage ? (
              <p className="mt-3 text-sm text-[var(--pf-text-secondary)]">{taxInvoice.lastErrorMessage}</p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--pf-border-default)] p-4">
            <p className="font-medium">{t('empty.title')}</p>
            <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('empty.body')}</p>
          </div>
        )}

        {canRequest ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => requestExternalStatutoryDocumentAction(billingRecordId))}
          >
            {t('actions.requestDocument')}
          </Button>
        ) : null}

        {blocking && taxInvoice?.issuanceOutcome === 'confirmed_created' ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('errors.duplicateIssuanceBlocked')}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
