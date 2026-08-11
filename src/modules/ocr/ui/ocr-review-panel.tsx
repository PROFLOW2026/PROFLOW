'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { pressableClassName } from '@/components/ui/pressable';
import { StatusBadge } from '@/components/ui/status-badge';
import { DocumentInlinePreview } from '@/modules/documents/ui/document-inline-preview';
import { DocumentPreviewDialog } from '@/modules/documents/ui/document-preview-dialog';
import {
  finalizeDocumentUploadAction,
  prepareDocumentUploadAction,
} from '@/modules/documents/application/document-actions';
import {
  confirmOcrCandidateAction,
  extractReceiptAction,
  rejectOcrCandidateAction,
  seedFixtureOcrJobAction,
} from '@/modules/ocr/application/ocr-actions';
import { confidenceState } from '@/modules/ocr/domain/confidence';
import { collectReviewWarnings } from '@/modules/ocr/domain/totals-warnings';
import { suggestedDraftTarget } from '@/modules/ocr/domain/canonical';
import type {
  ExtractionJob,
  OcrCandidateFieldKey,
  OcrDocumentTypeKey,
  OcrDraftTarget,
  OcrProviderStatus,
  OcrWorkflowContext,
  ReceiptExtractionCandidates,
} from '@/modules/ocr/domain/types';
import { OCR_CANDIDATE_FIELD_KEYS } from '@/modules/ocr/domain/types';
import { money } from '@/shared/money/money';
import { cn } from '@/shared/ui/cn';

function statusShape(
  status: ExtractionJob['status'],
): 'pending' | 'onHold' | 'completed' | 'rejected' {
  if (status === 'needs_review') return 'onHold';
  if (status === 'failed' || status === 'rejected') return 'rejected';
  if (status === 'succeeded') return 'completed';
  return 'pending';
}

const MONEY_FIELDS = new Set<OcrCandidateFieldKey>(['net', 'tax', 'gross']);
const DATE_FIELDS = new Set<OcrCandidateFieldKey>(['date', 'dueDate']);
const MONEY_PATTERN = /^-?\d+(\.\d+)?$/;

function hydrateOverrides(
  job: ExtractionJob | null | undefined,
): Partial<Record<OcrCandidateFieldKey, string>> {
  if (!job?.reviewOverrides) return {};
  const next: Partial<Record<OcrCandidateFieldKey, string>> = {};
  for (const key of OCR_CANDIDATE_FIELD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(job.reviewOverrides, key)) continue;
    const value = job.reviewOverrides[key];
    next[key] = value ?? '';
  }
  return next;
}

export interface OcrReviewPanelProps {
  readonly initialStatus: OcrProviderStatus;
  readonly initialJobs: readonly ExtractionJob[];
  readonly vendors: readonly { id: string; name: string }[];
  readonly organizationId: string;
  readonly defaultTarget: OcrDraftTarget;
  readonly workflow: OcrWorkflowContext;
  readonly canManageDocuments: boolean;
  readonly canCreateExpenses: boolean;
  readonly canManageAp: boolean;
  readonly offline?: boolean;
}

export function OcrReviewPanel({
  initialStatus,
  initialJobs,
  vendors,
  organizationId,
  defaultTarget,
  workflow,
  canManageDocuments,
  canCreateExpenses,
  canManageAp,
  offline = false,
}: OcrReviewPanelProps) {
  const t = useTranslations('documents.ocr');
  const [jobs, setJobs] = useState<ExtractionJob[]>([...initialJobs]);
  const [selectedId, setSelectedId] = useState<string | null>(initialJobs[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draftTarget, setDraftTarget] = useState<OcrDraftTarget>(defaultTarget);
  const [vendorId, setVendorId] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const liveExtract = initialStatus.ingestionEnabled && initialStatus.featureMode === 'live';
  const fixtureTools = initialStatus.featureMode === 'fixture_only';

  const selected = useMemo(
    () => jobs.find((job) => job.id === selectedId) ?? null,
    [jobs, selectedId],
  );

  const [overrides, setOverrides] = useState<Partial<Record<OcrCandidateFieldKey, string>>>(() =>
    hydrateOverrides(initialJobs[0] ?? null),
  );
  const [accepted, setAccepted] = useState<Partial<Record<OcrCandidateFieldKey, boolean>>>({});

  const acceptedFields = useMemo(
    () => OCR_CANDIDATE_FIELD_KEYS.filter((key) => accepted[key]),
    [accepted],
  );

  function candidateValue(
    candidates: ReceiptExtractionCandidates,
    key: OcrCandidateFieldKey,
  ): string {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      return overrides[key] ?? '';
    }
    return candidates[key].value ?? '';
  }

  function toggleAccepted(field: OcrCandidateFieldKey, next: boolean) {
    setAccepted((prev) => ({ ...prev, [field]: next }));
  }

  function selectJob(job: ExtractionJob) {
    setSelectedId(job.id);
    setOverrides(hydrateOverrides(job));
    setAccepted({});
    setError(null);
    setInfo(null);
    const matches = job.rawMetadata?.vendorMatches ?? [];
    const exact = matches.filter(
      (match) => match.strength === 'exact_identifier' || match.strength === 'exact_name',
    );
    setVendorId(
      exact.length === 1 ? exact[0]!.vendorId : matches.length === 1 ? matches[0]!.vendorId : '',
    );
    const typeKey = (job.rawMetadata?.documentTypeKey ?? 'unknown') as OcrDocumentTypeKey;
    setDraftTarget(suggestedDraftTarget(job.rawMetadata?.workflow ?? workflow, typeKey) || defaultTarget);
  }

  function onSeedFixture() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await seedFixtureOcrJobAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setJobs((prev) => [result.data, ...prev]);
      selectJob(result.data);
      setInfo(t('fixtureSeeded'));
    });
  }

  async function uploadThenExtract(file: File) {
    if (offline || !navigator.onLine) {
      setError(t('offlineBlocked'));
      return;
    }
    const prepared = await prepareDocumentUploadAction({
      ownerType: 'organization',
      ownerId: organizationId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    });
    if (prepared.error || !prepared.documentId || !prepared.uploadUrl) {
      setError(prepared.error ?? t('extractFailed', { code: 'upload' }));
      return;
    }
    const put = await fetch(prepared.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!put.ok) {
      setError(t('extractFailed', { code: 'upload' }));
      return;
    }
    const finalized = await finalizeDocumentUploadAction({
      documentId: prepared.documentId,
      sizeBytes: file.size,
    });
    if (finalized.error) {
      setError(finalized.error);
      return;
    }
    const result = await extractReceiptAction({
      documentId: prepared.documentId,
      mimeType: file.type || undefined,
      filename: file.name,
      workflow,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setJobs((prev) => [result.data, ...prev]);
    selectJob(result.data);
    if (result.data.status === 'failed') {
      setInfo(t('extractFailed', { code: result.data.errorCode ?? 'unknown' }));
    } else {
      setInfo(t('extractQueuedReview'));
    }
  }

  function onExtractImage(file: File | null) {
    if (!file) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      await uploadThenExtract(file);
    });
  }

  function onRetry() {
    if (!selected?.sourceDocument.documentId) return;
    startTransition(async () => {
      const result = await extractReceiptAction({
        documentId: selected.sourceDocument.documentId,
        mimeType: selected.sourceDocument.mimeType ?? undefined,
        filename: selected.sourceDocument.filename ?? undefined,
        workflow,
        forceRetry: true,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setJobs((prev) => [result.data, ...prev.filter((job) => job.id !== selected.id)]);
      selectJob(result.data);
    });
  }

  function onPreviewMapping() {
    if (!selected) return;
    setError(null);
    setInfo(null);
    if (acceptedFields.length === 0) {
      setError(t('acceptRequired'));
      return;
    }
    startTransition(async () => {
      const result = await confirmOcrCandidateAction({
        jobId: selected.id,
        confirm: false,
        draftTarget,
        vendorId: vendorId.trim() || null,
        acceptedFields,
        fieldOverrides: overrides,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setJobs((prev) => prev.map((job) => (job.id === result.data.job.id ? result.data.job : job)));
      setOverrides(hydrateOverrides(result.data.job));
      setInfo(t('mappedOnly'));
    });
  }

  function onConfirmDraft() {
    if (!selected) return;
    setError(null);
    setInfo(null);
    if (acceptedFields.length === 0) {
      setError(t('acceptRequired'));
      return;
    }
    if (draftTarget !== 'expense' && !vendorId.trim()) {
      setError(t('vendorRequired'));
      return;
    }
    startTransition(async () => {
      const result = await confirmOcrCandidateAction({
        jobId: selected.id,
        confirm: true,
        draftTarget,
        vendorId: vendorId.trim() || null,
        acceptedFields,
        fieldOverrides: overrides,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.kind === 'created') {
        setJobs((prev) =>
          prev.map((job) => (job.id === result.data.job.id ? result.data.job : job)),
        );
        setOverrides(hydrateOverrides(result.data.job));
        if (result.data.draftTarget === 'vendor_bill') {
          setInfo(t('vendorBillCreated', { id: result.data.vendorBillId ?? '' }));
        } else if (result.data.draftTarget === 'vendor_credit') {
          setInfo(t('vendorCreditCreated', { id: result.data.vendorCreditId ?? '' }));
        } else {
          setInfo(t('expenseCreated', { id: result.data.expenseId ?? '' }));
        }
      }
    });
  }

  function onReject() {
    if (!selected) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await rejectOcrCandidateAction({ jobId: selected.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setJobs((prev) => prev.map((job) => (job.id === result.data.id ? result.data : job)));
      setInfo(t('rejected'));
    });
  }

  const canConfirmTarget =
    draftTarget === 'expense' ? canCreateExpenses : canManageAp;

  const reviewLocked =
    !canConfirmTarget ||
    selected?.status === 'succeeded' ||
    selected?.status === 'rejected' ||
    Boolean(selected?.confirmedExpenseId) ||
    Boolean(selected?.confirmedVendorBillId) ||
    Boolean(selected?.confirmedVendorCreditId) ||
    !selected?.candidates;

  const currencyCode = selected?.candidates
    ? candidateValue(selected.candidates, 'currency').trim().toUpperCase() || 'ILS'
    : 'ILS';

  const warnings = selected?.candidates
    ? collectReviewWarnings(selected.candidates, {
        vendorResolved: Boolean(vendorId.trim()),
        draftTarget,
      })
    : [];
  const vendorMatches = selected?.rawMetadata?.vendorMatches ?? [];
  const duplicateHits = selected?.rawMetadata?.duplicateHits ?? [];
  const sourceDocumentId = selected?.sourceDocument.documentId;

  return (
    <div className="flex flex-col gap-6" dir="auto" data-pf-ocr-review>
      <Alert tone={initialStatus.featureMode === 'live' ? 'info' : 'warning'}>
        {t(initialStatus.messageKey)}
      </Alert>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('honesty')}</p>
      {offline || (typeof navigator !== 'undefined' && !navigator.onLine) ? (
        <Alert tone="warning">{t('offlineBlocked')}</Alert>
      ) : null}
      {error ? (
        <Alert tone="danger" id="ocr-review-error" aria-live="assertive">
          {error}
        </Alert>
      ) : null}
      {info ? (
        <Alert tone="info" id="ocr-review-info" aria-live="polite">
          {info}
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canManageDocuments && fixtureTools ? (
          <Button type="button" variant="secondary" loading={pending} onClick={onSeedFixture}>
            {t('seedFixture')}
          </Button>
        ) : null}
        {canManageDocuments && liveExtract ? (
          <>
            <Label
              className={cn(
                pressableClassName,
                'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-3 text-sm',
              )}
            >
              <span>{t('extractCapture')}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={pending}
                onChange={(event) => {
                  onExtractImage(event.target.files?.[0] ?? null);
                  event.target.value = '';
                }}
              />
            </Label>
            <Label
              className={cn(
                pressableClassName,
                'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-3 text-sm',
              )}
            >
              <span>{t('extractImage')}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/bmp,image/tiff,application/pdf"
                className="sr-only"
                disabled={pending}
                onChange={(event) => {
                  onExtractImage(event.target.files?.[0] ?? null);
                  event.target.value = '';
                }}
              />
            </Label>
          </>
        ) : null}
      </div>

      {jobs.length === 0 ? (
        <Alert tone="info">{t('empty')}</Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <ul className="flex flex-col gap-2" role="listbox" aria-label={t('title')}>
            {jobs.map((job) => (
              <li key={job.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={job.id === selectedId}
                  className={cn(
                    pressableClassName,
                    'flex w-full min-h-11 items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-start text-sm',
                  )}
                  onClick={() => selectJob(job)}
                >
                  <span className="truncate text-xs">
                    {job.sourceDocument.filename ?? job.id.slice(0, 8)}
                  </span>
                  <StatusBadge shape={statusShape(job.status)} label={t(`status.${job.status}`)} />
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] xl:items-start">
              <div className="order-first flex flex-col gap-2">
                <p className="text-sm font-medium">{t('sourceDocument')}</p>
                {sourceDocumentId ? (
                  <DocumentInlinePreview
                    documentId={sourceDocumentId}
                    filename={selected.sourceDocument.filename ?? t('sourceDocumentUnknown')}
                    mimeType={selected.sourceDocument.mimeType ?? ''}
                  />
                ) : (
                  <p className="text-sm text-[var(--pf-text-secondary)]">
                    {selected.sourceDocument.filename ?? t('sourceDocumentUnknown')}
                  </p>
                )}
                {sourceDocumentId ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    onClick={() => setPreviewOpen(true)}
                  >
                    {t('viewOriginal')}
                  </Button>
                ) : null}
                {selected.status === 'failed' && sourceDocumentId ? (
                  <Button type="button" className="min-h-11" loading={pending} onClick={onRetry}>
                    {t('retry')}
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-col gap-4">
              {duplicateHits.length > 0 ? (
                <Alert tone="warning">
                  {t('duplicateWarning')}
                  <ul className="mt-2 list-disc ps-5 text-sm">
                    {duplicateHits.map((hit, index) => (
                      <li key={`${hit.kind}-${index}`}>
                        {hit.kind === 'exact_file' ? t('duplicateExactFile') : t('duplicateProbable')}
                      </li>
                    ))}
                  </ul>
                </Alert>
              ) : null}

              {warnings.map((warning) => (
                <Alert key={warning.code} tone="warning">
                  {t(warning.messageKey)}
                </Alert>
              ))}

              {selected.candidates ? (
                <>
                  {OCR_CANDIDATE_FIELD_KEYS.map((field) => {
                    const value = candidateValue(selected.candidates!, field);
                    const state = confidenceState({
                      value: value || null,
                      confidence: selected.candidates![field].confidence,
                      provenance: selected.candidates![field].provenance,
                    });
                    const showMoneyPreview =
                      MONEY_FIELDS.has(field) && MONEY_PATTERN.test(value.trim());
                    return (
                      <div key={field} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor={`ocr-${field}`}>{t(`fields.${field}`)}</Label>
                          <span className="text-xs text-[var(--pf-text-secondary)]">
                            {t(`confidenceState.${state}`)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            id={`ocr-${field}`}
                            value={value}
                            disabled={reviewLocked}
                            numeric={MONEY_FIELDS.has(field) || field === 'currency'}
                            type={DATE_FIELDS.has(field) ? 'date' : 'text'}
                            onChange={(event) =>
                              setOverrides((prev) => ({ ...prev, [field]: event.target.value }))
                            }
                          />
                          <label className="flex min-h-11 items-center gap-2 text-xs">
                            <Checkbox
                              checked={Boolean(accepted[field])}
                              disabled={reviewLocked || pending}
                              onCheckedChange={(checked) =>
                                toggleAccepted(field, checked === true)
                              }
                              aria-label={t('acceptField', { field: t(`fields.${field}`) })}
                            />
                            {t('accept')}
                          </label>
                        </div>
                        {showMoneyPreview ? (
                          <p className="text-sm" dir="ltr">
                            <MoneyText value={money(value.trim(), currencyCode)} />
                          </p>
                        ) : null}
                      </div>
                    );
                  })}

                  {selected.candidates.lines.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-medium">{t('lineItems')}</p>
                      <ul className="list-disc ps-5 text-sm text-[var(--pf-text-secondary)]">
                        {selected.candidates.lines.map((line, index) => (
                          <li key={`line-${index}`}>
                            {line.description.value ?? '—'}
                            {line.lineTotal.value ? ` · ${line.lineTotal.value}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <fieldset className="flex flex-col gap-2">
                    <legend className="text-sm font-medium">{t('draftTargetTitle')}</legend>
                    <p className="text-xs text-[var(--pf-text-secondary)]">{t('draftTargetHint')}</p>
                    <div className="flex flex-wrap gap-3">
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="ocr-draft-target"
                          checked={draftTarget === 'expense'}
                          disabled={reviewLocked || pending || !canCreateExpenses}
                          onChange={() => setDraftTarget('expense')}
                        />
                        {t('draftTargetExpense')}
                      </label>
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="ocr-draft-target"
                          checked={draftTarget === 'vendor_bill'}
                          disabled={reviewLocked || pending || !canManageAp}
                          onChange={() => setDraftTarget('vendor_bill')}
                        />
                        {t('draftTargetVendorBill')}
                      </label>
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="ocr-draft-target"
                          checked={draftTarget === 'vendor_credit'}
                          disabled={reviewLocked || pending || !canManageAp}
                          onChange={() => setDraftTarget('vendor_credit')}
                        />
                        {t('draftTargetVendorCredit')}
                      </label>
                    </div>
                    {draftTarget !== 'expense' ? (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="ocr-vendor-entity">{t('vendorEntity')}</Label>
                        {vendorMatches.length === 1 &&
                        (vendorMatches[0]?.strength === 'exact_identifier' ||
                          vendorMatches[0]?.strength === 'exact_name') ? (
                          <p className="text-sm text-[var(--pf-text-secondary)]">{t('vendorExact')}</p>
                        ) : vendorMatches.length > 1 ? (
                          <p className="text-sm text-[var(--pf-text-secondary)]">{t('vendorProbable')}</p>
                        ) : (
                          <p className="text-sm text-[var(--pf-text-secondary)]">{t('vendorNone')}</p>
                        )}
                        <select
                          id="ocr-vendor-entity"
                          className="min-h-11 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
                          value={vendorId}
                          disabled={reviewLocked || pending}
                          onChange={(event) => setVendorId(event.target.value)}
                        >
                          <option value="">{t('vendorEntityPlaceholder')}</option>
                          {vendors.map((vendor) => (
                            <option key={vendor.id} value={vendor.id}>
                              {vendor.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </fieldset>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11"
                      disabled={pending || reviewLocked || acceptedFields.length === 0}
                      onClick={onPreviewMapping}
                    >
                      {t('previewMapping')}
                    </Button>
                    <Button
                      type="button"
                      className="min-h-11"
                      disabled={pending || reviewLocked || acceptedFields.length === 0}
                      onClick={onConfirmDraft}
                    >
                      {draftTarget === 'vendor_bill'
                        ? t('confirmVendorBill')
                        : draftTarget === 'vendor_credit'
                          ? t('confirmVendorCredit')
                          : t('confirmExpense')}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11"
                      disabled={pending || !canManageDocuments || reviewLocked}
                      onClick={onReject}
                    >
                      {t('rejectReview')}
                    </Button>
                  </div>
                </>
              ) : (
                <Alert tone="warning">{selected.errorMessage ?? t('noCandidates')}</Alert>
              )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {sourceDocumentId && selected ? (
        <DocumentPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          documentId={sourceDocumentId}
          filename={selected.sourceDocument.filename ?? t('sourceDocumentUnknown')}
          mimeType={selected.sourceDocument.mimeType ?? ''}
        />
      ) : null}
    </div>
  );
}
