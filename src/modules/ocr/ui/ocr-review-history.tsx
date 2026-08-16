'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { DocumentPreviewDialog } from '@/modules/documents/ui/document-preview-dialog';
import { documentTypeLabel } from '@/modules/ocr/domain/israeli-normalize';
import type { ExtractionJob, OcrDocumentTypeKey, OcrDraftTarget } from '@/modules/ocr/domain/types';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

function historyVendor(job: ExtractionJob): string {
  const fromCandidates = job.candidates?.vendor.value?.trim();
  if (fromCandidates) return fromCandidates;
  const match = job.rawMetadata?.vendorMatches?.[0]?.vendorName?.trim();
  return match || '-';
}

function historyDocumentType(job: ExtractionJob): string {
  const fromCandidates = job.candidates?.documentType.value?.trim();
  if (fromCandidates) return fromCandidates;
  const key = job.rawMetadata?.documentTypeKey as OcrDocumentTypeKey | undefined;
  if (key) {
    const label = documentTypeLabel(key);
    if (label) return label;
  }
  return '-';
}

function targetHref(job: ExtractionJob): string | null {
  if (job.confirmedExpenseId) return `/expenses/${job.confirmedExpenseId}`;
  if (job.confirmedVendorBillId) return `/procurement/ap/${job.confirmedVendorBillId}`;
  if (job.confirmedVendorCreditId) {
    return `/procurement/ap/credits/${job.confirmedVendorCreditId}`;
  }
  return null;
}

function targetLabel(
  t: ReturnType<typeof useTranslations<'documents.ocr'>>,
  target: OcrDraftTarget | null | undefined,
): string {
  if (target === 'expense') return t('draftTargetExpense');
  if (target === 'vendor_bill') return t('draftTargetVendorBill');
  if (target === 'vendor_credit') return t('draftTargetVendorCredit');
  return '-';
}

function HistoryRow({ job }: { job: ExtractionJob }) {
  const t = useTranslations('documents.ocr');
  const locale = useLocale();
  const [previewOpen, setPreviewOpen] = useState(false);
  const accepted = job.status === 'succeeded' || job.reviewStatus === 'accepted';
  const documentId = job.sourceDocument.documentId;
  const href = targetHref(job);
  const when = new Date(job.updatedAt).toLocaleString(locale);

  return (
    <li
      data-pf-ocr-history-job-id={job.id}
      data-pf-ocr-history-status={accepted ? 'accepted' : 'rejected'}
      className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              shape={accepted ? 'completed' : 'rejected'}
              label={accepted ? t('historyStatusAccepted') : t('historyStatusRejected')}
            />
            <span className="text-xs text-[var(--pf-text-secondary)]">{when}</span>
          </div>
          <p
            dir="ltr"
            className="truncate text-sm font-medium"
            style={{ unicodeBidi: 'isolate' }}
          >
            {job.sourceDocument.filename ?? t('sourceDocumentUnknown')}
          </p>
          <dl className="grid gap-1 text-sm text-[var(--pf-text-secondary)] sm:grid-cols-2">
            <div>
              <dt className="inline">{t('historyVendor')}: </dt>
              <dd className="inline text-[var(--pf-text-primary)]">{historyVendor(job)}</dd>
            </div>
            <div>
              <dt className="inline">{t('historyDocumentType')}: </dt>
              <dd className="inline text-[var(--pf-text-primary)]">{historyDocumentType(job)}</dd>
            </div>
            {accepted ? (
              <div>
                <dt className="inline">{t('historyTarget')}: </dt>
                <dd className="inline text-[var(--pf-text-primary)]">
                  {targetLabel(t, job.confirmedDraftTarget)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          {documentId ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => setPreviewOpen(true)}
            >
              {t('historyOpenOriginal')}
            </Button>
          ) : null}
          {href ? (
            <Link href={href} className={cn(textNavLinkClassName, 'inline-flex min-h-11 items-center')}>
              {t('historyOpenTarget')}
            </Link>
          ) : null}
        </div>
      </div>
      {documentId ? (
        <DocumentPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          documentId={documentId}
          filename={job.sourceDocument.filename ?? t('sourceDocumentUnknown')}
          mimeType={job.sourceDocument.mimeType ?? ''}
        />
      ) : null}
    </li>
  );
}

export function OcrReviewHistory({ jobs }: { jobs: readonly ExtractionJob[] }) {
  const t = useTranslations('documents.ocr');

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-[var(--pf-text-secondary)]" data-pf-ocr-history-empty>
        {t('historyEmpty')}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3" data-pf-ocr-history aria-label={t('historyTitle')}>
      {jobs.map((job) => (
        <HistoryRow key={job.id} job={job} />
      ))}
    </ul>
  );
}
