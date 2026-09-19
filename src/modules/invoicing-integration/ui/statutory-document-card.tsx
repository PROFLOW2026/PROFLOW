'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoneyText } from '@/components/patterns/money-text';
import type { StorageProviderKey } from '@/modules/external-storage/client';
import { buildWhatsAppShareUrl } from '@/modules/communications/domain/whatsapp-share';
import type {
  ExternalStatutoryDocument,
  ReconciliationStatus,
} from '../domain/types';
import {
  resolveStatutoryStorageUiStatus,
  shouldShowStatutoryStorageSaveButton,
  type StatutoryStorageUiStatus,
} from '../domain/statutory-storage-ui';
import {
  createStatutoryShareLinkAction,
  refreshExternalStatutoryStatusAction,
  resolveStatutoryStorageLocationAction,
  saveStatutoryPdfToStorageAction,
} from './actions';

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

function isDocIssued(doc: ExternalStatutoryDocument): boolean {
  return doc.issuanceOutcome === 'confirmed_created' && Boolean(doc.externalId);
}

function docTitle(
  doc: ExternalStatutoryDocument,
  t: ReturnType<typeof useTranslations<'invoicingIntegration'>>,
): string {
  if (doc.kind === 'tax_invoice' && doc.externalNumber) {
    return t('issued.title', { number: doc.externalNumber });
  }
  if (doc.externalNumber) {
    return t(`documentKinds.${doc.kind}`, { number: doc.externalNumber });
  }
  return t(`documentKinds.${doc.kind}`, { number: '—' });
}

export type StatutoryDocumentCardProps = {
  doc: ExternalStatutoryDocument;
  billingRecordId: string;
  canManage: boolean;
  isHistorical: boolean;
  customerPhone?: string | null;
  primaryStorageProvider: StorageProviderKey | null;
  providerLabel: string;
  onPreview: (target: { externalDocumentId: string; title: string }) => void;
  /** Parent-owned send dialog (preferred). */
  onSendOpen?: (doc: ExternalStatutoryDocument) => void;
};

export function StatutoryDocumentCard({
  doc,
  billingRecordId,
  canManage,
  isHistorical,
  customerPhone = null,
  primaryStorageProvider,
  providerLabel,
  onPreview,
  onSendOpen,
}: StatutoryDocumentCardProps) {
  const t = useTranslations('invoicingIntegration');
  const tStorage = useTranslations('externalStorage.providers');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [resolvedStorageUrl, setResolvedStorageUrl] = useState<string | null>(null);
  const [resolvedStorageDocumentId, setResolvedStorageDocumentId] = useState<string | null>(null);

  const issued = isDocIssued(doc);
  const storageStatus: StatutoryStorageUiStatus = issued
    ? resolveStatutoryStorageUiStatus(doc)
    : 'pending';
  const showSaveButton =
    issued &&
    shouldShowStatutoryStorageSaveButton({
      issued,
      canManage: canManage && !isHistorical,
      storageStatus,
    });
  const storageDocumentId =
    storageStatus === 'saved' ? (doc.pdf?.storageDocumentId ?? null) : null;
  const title = docTitle(doc, t);
  const pendingIssuance =
    doc.issuanceOutcome === 'in_flight' || doc.issuanceOutcome === 'ambiguous';

  const storageLocationUrl =
    storageDocumentId && resolvedStorageDocumentId === storageDocumentId
      ? resolvedStorageUrl
      : null;

  useEffect(() => {
    if (!storageDocumentId) return;
    let cancelled = false;
    void resolveStatutoryStorageLocationAction(storageDocumentId).then((result) => {
      if (!cancelled) {
        setResolvedStorageUrl(result.url ?? null);
        setResolvedStorageDocumentId(storageDocumentId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storageDocumentId]);

  function run(action: () => Promise<{ error?: string; ok?: boolean }>) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  function handleSaveCopy() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await saveStatutoryPdfToStorageAction(doc.id, billingRecordId);
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

  async function ensureShareUrl(): Promise<string | null> {
    if (shareUrl) return shareUrl;
    const result = await createStatutoryShareLinkAction(doc.id);
    if (result.error || !result.shareUrl) {
      setError(result.error ?? t('errors.shareFailed'));
      return null;
    }
    setShareUrl(result.shareUrl);
    return result.shareUrl;
  }

  function handleShare() {
    startTransition(async () => {
      const url = await ensureShareUrl();
      if (!url) return;
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ title, url });
          setSuccess(t('actions.shareSuccess'));
          return;
        } catch {
          // fall through
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        setSuccess(t('actions.shareCopied'));
      } catch {
        setSuccess(url);
      }
    });
  }

  function handleCopyLink() {
    startTransition(async () => {
      const url = await ensureShareUrl();
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        setSuccess(t('actions.linkCopied'));
      } catch {
        setSuccess(url);
      }
    });
  }

  function handleWhatsApp() {
    startTransition(async () => {
      const url = await ensureShareUrl();
      if (!url) return;
      const message = t('share.messageTemplate', {
        number: doc.externalNumber ?? '—',
        link: url,
      });
      const waUrl = buildWhatsAppShareUrl({ phone: customerPhone, message });
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    });
  }

  return (
    <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <Badge tone="neutral">{t(`documentTypeLabels.${doc.kind}`)}</Badge>
        {issued ? (
          <Badge tone="success">{t('issued.badge')}</Badge>
        ) : pendingIssuance ? (
          <Badge tone="warning">{t('payment.receiptPending')}</Badge>
        ) : (
          <Badge tone="neutral">{t(`documentStatus.${doc.status}`)}</Badge>
        )}
        {doc.reconciliationStatus ? (
          <Badge tone={reconciliationTone(doc.reconciliationStatus)}>
            {t(`reconciliation.status.${doc.reconciliationStatus}`)}
          </Badge>
        ) : null}
      </div>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--pf-text-secondary)]">{t('fields.provider')}</dt>
          <dd>{providerLabel}</dd>
        </div>
        {doc.externalNumber ? (
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('fields.documentNumber')}</dt>
            <dd dir="ltr" className="pf-numeric">
              {doc.externalNumber}
            </dd>
          </div>
        ) : null}
        {doc.paymentId ? (
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('fields.linkedPayment')}</dt>
            <dd>{t('fields.linkedPaymentHint')}</dd>
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
              {storageStatus === 'saved' && storageLocationUrl ? (
                <a
                  href={storageLocationUrl}
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

      {error ? <p className="mt-2 text-sm text-[var(--pf-text-danger)]">{error}</p> : null}
      {success ? <p className="mt-2 text-sm text-[var(--pf-text-success)]">{success}</p> : null}

      {doc.reconciliationMetadata ? (
        <div className="mt-3 rounded-md bg-[var(--pf-bg-subtle)] p-3 text-sm">
          <p className="font-medium">{t('reconciliation.title')}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div>
              <p className="text-[var(--pf-text-secondary)]">{t('reconciliation.expectedNet')}</p>
              <MoneyText
                value={{
                  amount: doc.reconciliationMetadata.expectedNet,
                  currency: doc.reconciliationMetadata.currency,
                }}
              />
            </div>
            <div>
              <p className="text-[var(--pf-text-secondary)]">{t('reconciliation.expectedVat')}</p>
              <MoneyText
                value={{
                  amount: doc.reconciliationMetadata.expectedVat ?? '0',
                  currency: doc.reconciliationMetadata.currency,
                }}
              />
            </div>
            <div>
              <p className="text-[var(--pf-text-secondary)]">{t('reconciliation.expectedGross')}</p>
              <MoneyText
                value={{
                  amount: doc.reconciliationMetadata.expectedGross,
                  currency: doc.reconciliationMetadata.currency,
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {issued ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() => onPreview({ externalDocumentId: doc.id, title })}
          >
            {t('actions.viewPdf')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => window.location.assign(pdfUrl(doc.id, 'attachment'))}
          >
            {t('actions.downloadPdf')}
          </Button>
          {!isHistorical && canManage ? (
            <>
              {onSendOpen ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => onSendOpen(doc)}
                >
                  {t('actions.sendToCustomer')}
                </Button>
              ) : null}
              <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={handleShare}>
                {t('actions.share')}
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={handleCopyLink}>
                {t('actions.copyLink')}
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={handleWhatsApp}>
                {t('actions.whatsapp')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => refreshExternalStatutoryStatusAction(doc.id, billingRecordId))}
              >
                {t('actions.refreshStatus')}
              </Button>
              {showSaveButton ? (
                <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={handleSaveCopy}>
                  {storageStatus === 'failed' ? t('actions.retryStorageSave') : t('actions.saveCopy')}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {doc.lastErrorMessage ? (
        <p className="mt-3 text-sm text-[var(--pf-text-secondary)]">{doc.lastErrorMessage}</p>
      ) : null}
    </div>
  );
}
