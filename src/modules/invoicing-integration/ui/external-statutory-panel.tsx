'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { MoneyText } from '@/components/patterns/money-text';
import type { StorageProviderKey } from '@/modules/external-storage/client';
import type {
  ExternalStatutoryDocument,
  ReconciliationStatus,
  StatutoryProviderStatus,
} from '../domain/types';
import {
  resolveStatutoryStorageUiStatus,
  shouldShowStatutoryStorageSaveButton,
} from '../domain/statutory-storage-ui';
import {
  createStatutoryShareLinkAction,
  refreshExternalStatutoryStatusAction,
  requestExternalStatutoryDocumentAction,
  resolveStatutoryStorageLocationAction,
  saveStatutoryPdfToStorageAction,
  sendExternalStatutoryDocumentAction,
} from './actions';

export interface ExternalStatutoryPanelProps {
  billingRecordId: string;
  billingStatus: 'draft' | 'finalized' | 'void';
  canManage: boolean;
  providerStatus: StatutoryProviderStatus;
  documents: readonly ExternalStatutoryDocument[];
  hasCustomerSnapshot: boolean;
  customerEmail: string | null;
  primaryStorageProvider: StorageProviderKey | null;
}

function reconciliationTone(
  status: ReconciliationStatus | null | undefined,
): 'success' | 'warning' | 'neutral' {
  if (status === 'matched') return 'success';
  if (status === 'mismatch') return 'warning';
  return 'neutral';
}

function pdfUrl(externalDocumentId: string, disposition: 'inline' | 'attachment'): string {
  return `/api/invoicing/statutory/${externalDocumentId}/pdf?disposition=${disposition}`;
}

export function ExternalStatutoryPanel({
  billingRecordId,
  billingStatus,
  canManage,
  providerStatus,
  documents,
  hasCustomerSnapshot,
  customerEmail,
  primaryStorageProvider,
}: ExternalStatutoryPanelProps) {
  const t = useTranslations('invoicingIntegration');
  const tStorage = useTranslations('externalStorage.providers');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [storageLocationUrl, setStorageLocationUrl] = useState<string | null>(null);
  const [storageLocationResolvedFor, setStorageLocationResolvedFor] = useState<string | null>(
    null,
  );

  const taxInvoice = documents.find((doc) => doc.kind === 'tax_invoice') ?? null;
  const linkedDocuments = documents.filter(
    (doc) =>
      doc.kind === 'receipt' ||
      doc.kind === 'tax_invoice_receipt' ||
      doc.kind === 'transaction_invoice',
  );
  const issued = taxInvoice?.issuanceOutcome === 'confirmed_created' && Boolean(taxInvoice.externalId);
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
    setSuccess(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  function openSendDialog() {
    setSendEmail(customerEmail?.trim() ?? '');
    setSendOpen(true);
    setError(null);
    setSuccess(null);
  }

  function handleShare() {
    if (!taxInvoice) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await createStatutoryShareLinkAction(taxInvoice.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (!result.shareUrl) return;
      setShareUrl(result.shareUrl);
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: t('issued.shareTitle', { number: taxInvoice.externalNumber ?? '' }),
            url: result.shareUrl,
          });
          setSuccess(t('actions.shareSuccess'));
          return;
        } catch {
          // fall through to clipboard
        }
      }
      try {
        await navigator.clipboard.writeText(result.shareUrl);
        setSuccess(t('actions.shareCopied'));
      } catch {
        setSuccess(result.shareUrl);
      }
    });
  }

  const storageStatus = taxInvoice ? resolveStatutoryStorageUiStatus(taxInvoice) : 'pending';
  const showSaveButton = taxInvoice
    ? shouldShowStatutoryStorageSaveButton({
        issued,
        canManage,
        storageStatus,
      })
    : false;

  const storageDocumentId =
    storageStatus === 'saved' ? (taxInvoice?.pdf?.storageDocumentId ?? null) : null;
  const effectiveStorageLocationUrl =
    storageDocumentId && storageLocationResolvedFor === storageDocumentId
      ? storageLocationUrl
      : null;

  useEffect(() => {
    if (!storageDocumentId) {
      return;
    }
    let cancelled = false;
    void resolveStatutoryStorageLocationAction(storageDocumentId).then((result) => {
      if (!cancelled) {
        setStorageLocationUrl(result.url ?? null);
        setStorageLocationResolvedFor(storageDocumentId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storageDocumentId]);

  function handleSaveCopy() {
    if (!taxInvoice) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await saveStatutoryPdfToStorageAction(taxInvoice.id, billingRecordId);
      if (result.error) {
        setError(result.error);
        router.refresh();
        return;
      }
      router.refresh();
      setSuccess(
        primaryStorageProvider
          ? t('storage.savedStatus', { provider: tStorage(primaryStorageProvider) })
          : t('storage.savedStatusGeneric'),
      );
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
        {success ? <Alert tone="success">{success}</Alert> : null}

        {taxInvoice?.reconciliationStatus === 'mismatch' ? (
          <Alert tone="warning">{t('reconciliation.mismatchBanner')}</Alert>
        ) : null}

        {taxInvoice ? (
          <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  {issued && taxInvoice.externalNumber
                    ? t('issued.title', { number: taxInvoice.externalNumber })
                    : t('separation.externalDocument')}
                </span>
                {issued ? (
                  <Badge tone="success">{t('issued.badge')}</Badge>
                ) : (
                  <Badge tone="neutral">{t(`documentStatus.${taxInvoice.status}`)}</Badge>
                )}
                {taxInvoice.reconciliationStatus ? (
                  <Badge tone={reconciliationTone(taxInvoice.reconciliationStatus)}>
                    {t(`reconciliation.status.${taxInvoice.reconciliationStatus}`)}
                  </Badge>
                ) : null}
              </div>
            </div>

            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[var(--pf-text-secondary)]">{t('fields.provider')}</dt>
                <dd>SUMIT</dd>
              </div>
              {taxInvoice.externalNumber ? (
                <div>
                  <dt className="text-[var(--pf-text-secondary)]">{t('fields.documentNumber')}</dt>
                  <dd dir="ltr" className="pf-numeric">
                    {taxInvoice.externalNumber}
                  </dd>
                </div>
              ) : null}
              {issued ? (
                <div className="sm:col-span-2">
                  <dt className="text-[var(--pf-text-secondary)]">{t('fields.storageCopy')}</dt>
                  <dd className="flex flex-col gap-1">
                    {storageStatus === 'saved' && primaryStorageProvider ? (
                      <span>{t('storage.savedStatus', { provider: tStorage(primaryStorageProvider) })}</span>
                    ) : storageStatus === 'failed' ? (
                      <span className="text-[var(--pf-text-warning)]">{t('storage.failedStatus')}</span>
                    ) : (
                      <span>{t('storage.pendingStatus')}</span>
                    )}
                    {storageStatus === 'saved' && effectiveStorageLocationUrl ? (
                      <a
                        href={effectiveStorageLocationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--pf-accent)] underline"
                      >
                        {t('actions.openStorageLocation')}
                      </a>
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>

            {issued && canManage ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => window.open(pdfUrl(taxInvoice.id, 'inline'), '_blank', 'noopener,noreferrer')}
                >
                  {t('actions.viewPdf')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    window.location.assign(pdfUrl(taxInvoice.id, 'attachment'));
                  }}
                >
                  {t('actions.downloadPdf')}
                </Button>
                <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={openSendDialog}>
                  {t('actions.sendToCustomer')}
                </Button>
                <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={handleShare}>
                  {t('actions.share')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => refreshExternalStatutoryStatusAction(taxInvoice.id, billingRecordId))
                  }
                >
                  {t('actions.refreshStatus')}
                </Button>
                {showSaveButton ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={pending}
                    onClick={handleSaveCopy}
                  >
                    {storageStatus === 'failed'
                      ? t('actions.retryStorageSave')
                      : t('actions.saveCopy')}
                  </Button>
                ) : null}
              </div>
            ) : null}

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

            {taxInvoice.externalId ? (
              <details className="mt-3 text-xs text-[var(--pf-text-muted)]">
                <summary>{t('fields.technicalDetails')}</summary>
                <p className="mt-1 break-all" dir="ltr">
                  DocumentID: {taxInvoice.externalId}
                </p>
                {shareUrl ? (
                  <p className="mt-1 break-all" dir="ltr">
                    {shareUrl}
                  </p>
                ) : null}
              </details>
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

        {linkedDocuments.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3">
            {linkedDocuments.map((doc) => {
              const docIssued =
                doc.issuanceOutcome === 'confirmed_created' && Boolean(doc.externalId);
              return (
                <div
                  key={doc.id}
                  className="rounded-lg border border-[var(--pf-border-default)] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {t(`documentKinds.${doc.kind}`, {
                        number: doc.externalNumber ?? '—',
                      })}
                    </p>
                    {docIssued ? <Badge tone="success">{t('issued.badge')}</Badge> : null}
                    {doc.issuanceOutcome === 'in_flight' || doc.issuanceOutcome === 'ambiguous' ? (
                      <Badge tone="warning">{t('payment.receiptPending')}</Badge>
                    ) : null}
                  </div>
                  {docIssued ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild type="button" variant="secondary" size="sm">
                        <a href={pdfUrl(doc.id, 'inline')} target="_blank" rel="noreferrer">
                          {t('actions.viewPdf')}
                        </a>
                      </Button>
                      <Button asChild type="button" variant="secondary" size="sm">
                        <a href={pdfUrl(doc.id, 'attachment')}>{t('actions.downloadPdf')}</a>
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent closeLabel={t('actions.sendCancel')}>
          <DialogHeader>
            <DialogTitle>
              {t('send.title', { number: taxInvoice?.externalNumber ?? '' })}
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
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setSendOpen(false)}>
              {t('actions.sendCancel')}
            </Button>
            <Button
              type="button"
              disabled={pending || !sendEmail.trim()}
              onClick={() => {
                if (!taxInvoice) return;
                run(async () => {
                  const result = await sendExternalStatutoryDocumentAction(
                    taxInvoice.id,
                    billingRecordId,
                    sendEmail,
                  );
                  if (result.ok) {
                    setSendOpen(false);
                    setSuccess(t('send.success'));
                  }
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
