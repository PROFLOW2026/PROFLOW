'use client';

import dynamic from 'next/dynamic';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { StorageProviderKey } from '@/modules/external-storage/client';
import type { ExternalStatutoryDocument, StatutoryProviderStatus } from '../domain/types';
import { requestExternalStatutoryDocumentAction, sendExternalStatutoryDocumentAction } from './actions';
import { StatutoryDocumentCard } from './statutory-document-card';

const PdfJsViewer = dynamic(
  () => import('@/modules/external-storage/ui/pdf-js-viewer').then((mod) => mod.PdfJsViewer),
  {
    ssr: false,
    loading: () => null,
  },
);

type PdfPreviewTarget = {
  externalDocumentId: string;
  title: string;
};

export interface ExternalStatutoryPanelProps {
  billingRecordId: string;
  billingStatus: 'draft' | 'finalized' | 'void';
  canManage: boolean;
  providerStatus: StatutoryProviderStatus;
  documents: readonly ExternalStatutoryDocument[];
  hasCustomerSnapshot: boolean;
  customerEmail: string | null;
  customerPhone?: string | null;
  primaryStorageProvider: StorageProviderKey | null;
  variant?: 'active' | 'historical';
  providerDisplayName?: string | null;
}

function pdfUrl(externalDocumentId: string): string {
  return `/api/invoicing/statutory/${externalDocumentId}/pdf?disposition=inline`;
}

function sortDocuments(docs: readonly ExternalStatutoryDocument[]): ExternalStatutoryDocument[] {
  const kindOrder: Record<string, number> = {
    tax_invoice: 0,
    transaction_invoice: 1,
    tax_invoice_receipt: 2,
    receipt: 3,
    credit_note: 4,
    proforma: 5,
    other: 6,
  };
  return [...docs].sort((a, b) => {
    const ka = kindOrder[a.kind] ?? 99;
    const kb = kindOrder[b.kind] ?? 99;
    if (ka !== kb) return ka - kb;
    const ta = Date.parse(a.issuedAt ?? a.requestedAt);
    const tb = Date.parse(b.issuedAt ?? b.requestedAt);
    return tb - ta;
  });
}

export function ExternalStatutoryPanel({
  billingRecordId,
  billingStatus,
  canManage,
  providerStatus,
  documents,
  hasCustomerSnapshot,
  customerEmail,
  customerPhone = null,
  primaryStorageProvider,
  variant = 'active',
  providerDisplayName = null,
}: ExternalStatutoryPanelProps) {
  const t = useTranslations('invoicingIntegration');
  const tCommon = useTranslations('common');
  const isHistorical = variant === 'historical';
  const providerLabel = providerDisplayName ?? 'SUMIT';
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewTarget | null>(null);
  const [pdfReloadKey, setPdfReloadKey] = useState(0);
  const [sendDoc, setSendDoc] = useState<ExternalStatutoryDocument | null>(null);
  const [sendEmail, setSendEmail] = useState('');

  const sortedDocs = sortDocuments(documents);
  const taxInvoice = documents.find((doc) => doc.kind === 'tax_invoice') ?? null;
  const blockingTaxInvoice =
    taxInvoice &&
    (taxInvoice.issuanceOutcome === 'in_flight' ||
      taxInvoice.issuanceOutcome === 'ambiguous' ||
      taxInvoice.issuanceOutcome === 'confirmed_created');

  const canRequest =
    !isHistorical &&
    canManage &&
    providerStatus.featureEnabled &&
    billingStatus === 'finalized' &&
    hasCustomerSnapshot &&
    !blockingTaxInvoice;

  function run(action: () => Promise<{ error?: string; ok?: boolean }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  function openSendDialog(doc: ExternalStatutoryDocument) {
    setSendDoc(doc);
    setSendEmail(customerEmail?.trim() ?? '');
    setError(null);
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-start text-base">
          {isHistorical ? t('historical.title') : t('accountingSection.title')}
        </CardTitle>
        <p className="text-start text-sm text-[var(--pf-text-secondary)]">
          {isHistorical ? t('historical.subtitle') : t('accountingSection.subtitle')}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-start">
        {!isHistorical ? (
          <>
            <p className="text-xs text-[var(--pf-text-muted)]">{t('separation.disclosure')}</p>
            {!providerStatus.featureEnabled ? (
              <Alert tone="warning">{t(providerStatus.messageKey)}</Alert>
            ) : null}
            {billingStatus !== 'finalized' ? (
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('errors.billingNotFinalized')}</p>
            ) : null}
            {!hasCustomerSnapshot && billingStatus === 'finalized' ? (
              <Alert tone="warning">{t('errors.missingCustomerSnapshot')}</Alert>
            ) : null}
          </>
        ) : null}

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {sortedDocs.length === 0 && !isHistorical ? (
          <div className="rounded-lg border border-dashed border-[var(--pf-border-default)] p-4">
            <p className="font-medium">{t('empty.title')}</p>
            <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('empty.body')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sortedDocs.map((doc) => (
              <StatutoryDocumentCard
                key={doc.id}
                doc={doc}
                billingRecordId={billingRecordId}
                canManage={canManage}
                isHistorical={isHistorical}
                customerPhone={customerPhone}
                primaryStorageProvider={primaryStorageProvider}
                providerLabel={providerLabel}
                onSendOpen={openSendDialog}
                onPreview={(target) => {
                  setPdfReloadKey((key) => key + 1);
                  setPdfPreview(target);
                }}
              />
            ))}
          </div>
        )}

        {!isHistorical && canManage && sortedDocs.some((d) => d.issuanceOutcome === 'confirmed_created') ? (
          <p className="text-xs text-[var(--pf-text-muted)]">{t('history.hint')}</p>
        ) : null}

        {canRequest ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => requestExternalStatutoryDocumentAction(billingRecordId))}
          >
            {t('actions.requestDocument')}
          </Button>
        ) : null}

        {blockingTaxInvoice && taxInvoice?.issuanceOutcome === 'confirmed_created' ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('errors.duplicateIssuanceBlocked')}</p>
        ) : null}
      </CardContent>

      <Dialog
        open={pdfPreview != null}
        onOpenChange={(open) => {
          if (!open) setPdfPreview(null);
        }}
      >
        <DialogContent closeLabel={tCommon('actions.close')} className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{pdfPreview?.title ?? t('actions.viewPdf')}</DialogTitle>
            <DialogDescription>{t('fields.pdf')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="min-h-[70vh] p-0">
            {pdfPreview ? (
              <div className="h-[70vh] w-full min-w-0">
                <PdfJsViewer
                  url={pdfUrl(pdfPreview.externalDocumentId)}
                  reloadKey={pdfReloadKey}
                  onRetry={() => setPdfReloadKey((key) => key + 1)}
                />
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPdfPreview(null)}>
              {tCommon('actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sendDoc != null} onOpenChange={(open) => !open && setSendDoc(null)}>
        <DialogContent closeLabel={t('actions.sendCancel')}>
          <DialogHeader>
            <DialogTitle>
              {t('send.title', { number: sendDoc?.externalNumber ?? '' })}
            </DialogTitle>
            <DialogDescription>{t('send.description')}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-2">
              <Label htmlFor="statutory-send-email">{t('send.toLabel')}</Label>
              <Input
                id="statutory-send-email"
                type="email"
                dir="ltr"
                value={sendEmail}
                onChange={(event) => setSendEmail(event.target.value)}
                placeholder={t('send.emailPlaceholder')}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setSendDoc(null)}>
              {t('actions.sendCancel')}
            </Button>
            <Button
              type="button"
              disabled={pending || !sendEmail.trim() || !sendDoc}
              onClick={() => {
                if (!sendDoc) return;
                run(async () => {
                  const result = await sendExternalStatutoryDocumentAction(
                    sendDoc.id,
                    billingRecordId,
                    sendEmail,
                  );
                  if (result.ok) setSendDoc(null);
                  return result;
                });
              }}
            >
              {t('actions.sendConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
