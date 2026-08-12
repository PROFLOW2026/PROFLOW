'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
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
  softDeleteDocumentAction,
} from '@/modules/documents/application/document-actions';
import { openFilePicker } from '@/modules/documents/client/open-file-picker';
import { uploadDocumentBytes } from '@/modules/documents/client/upload-document-bytes';
import { normalizeUploadMime } from '@/modules/documents/domain/file-rules';
import type { DocumentRuntimeStage } from '@/modules/documents/domain/runtime-stage';
import {
  confirmOcrCandidateAction,
  extractReceiptAction,
  rejectOcrCandidateAction,
  seedFixtureOcrJobAction,
} from '@/modules/ocr/application/ocr-actions';
import { isOcrActiveQueueStatus } from '@/modules/ocr/domain/review-queue';
import { confidenceState } from '@/modules/ocr/domain/confidence';
import { collectReviewWarnings } from '@/modules/ocr/domain/totals-warnings';
import { suggestedDraftTarget } from '@/modules/ocr/domain/canonical';
import { isOcrSupportedMime } from '@/modules/ocr/domain/cost-controls';
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
const OCR_FILE_ACCEPT =
  '.jpg,.jpeg,.jfif,.png,.bmp,.tif,.tiff,.pdf,.heic,.heif,image/jpeg,image/png,image/bmp,image/tiff,image/heic,image/heif,application/pdf';

/** Survives `dynamic(..., { ssr:false })` remounts after server-action refresh. */
const ocrSelectionMemory = new Map<string, string>();

function prependJob(prev: ExtractionJob[], job: ExtractionJob): ExtractionJob[] {
  return [job, ...prev.filter((item) => item.id !== job.id)];
}

function fileUploadKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function extractionStageCode(job: ExtractionJob): string {
  const raw = job.errorCode ?? 'unknown';
  const category = job.rawMetadata?.errorCategory;
  if (raw === 'storage_download') return 'storage_download';
  if (raw === 'timeout' || category === 'timeout') return 'azure_poll';
  if (raw === 'provider_error' || raw === 'empty_result') return 'azure_analyze';
  return raw;
}

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
  const activeInitialJobs = useMemo(
    () => initialJobs.filter((job) => isOcrActiveQueueStatus(job.status)),
    [initialJobs],
  );
  const [jobs, setJobs] = useState<ExtractionJob[]>(() => [...activeInitialJobs]);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const remembered = ocrSelectionMemory.get(organizationId);
    if (remembered && activeInitialJobs.some((job) => job.id === remembered)) {
      return remembered;
    }
    return activeInitialJobs[0]?.id ?? null;
  });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draftTarget, setDraftTarget] = useState<OcrDraftTarget>(defaultTarget);
  const [vendorId, setVendorId] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadGenerationRef = useRef(0);
  const activeUploadKeyRef = useRef<string | null>(null);
  const jobsRef = useRef(jobs);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const liveExtract = initialStatus.ingestionEnabled && initialStatus.featureMode === 'live';
  const fixtureTools = initialStatus.featureMode === 'fixture_only';

  const selected = useMemo(
    () => jobs.find((job) => job.id === selectedId) ?? null,
    [jobs, selectedId],
  );

  const [overrides, setOverrides] = useState<Partial<Record<OcrCandidateFieldKey, string>>>(() => {
    const remembered = ocrSelectionMemory.get(organizationId);
    const initial =
      (remembered ? activeInitialJobs.find((job) => job.id === remembered) : undefined) ??
      activeInitialJobs[0] ??
      null;
    return hydrateOverrides(initial);
  });
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

  function applyJobSelection(job: ExtractionJob, options?: { clearMessages?: boolean }) {
    ocrSelectionMemory.set(organizationId, job.id);
    setPreviewOpen(false);
    setSelectedId(job.id);
    setOverrides(hydrateOverrides(job));
    setAccepted({});
    if (options?.clearMessages !== false) {
      setError(null);
      setInfo(null);
    }
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

  function clearActiveSelection() {
    ocrSelectionMemory.delete(organizationId);
    setPreviewOpen(false);
    setSelectedId(null);
    setOverrides({});
    setAccepted({});
    setVendorId('');
    setDraftTarget(defaultTarget);
  }

  function selectJob(job: ExtractionJob) {
    applyJobSelection(job);
  }

  /** Terminal confirm/reject: drop from active queue and move to the next actionable job. */
  function leaveTerminalJob(completedId: string, infoMessage: string) {
    const prev = jobsRef.current;
    const index = prev.findIndex((job) => job.id === completedId);
    const remaining = prev.filter((job) => job.id !== completedId);
    const next =
      remaining.length === 0
        ? null
        : remaining[Math.min(Math.max(index, 0), remaining.length - 1)]!;

    jobsRef.current = remaining;
    setJobs(remaining);
    if (next) {
      applyJobSelection(next, { clearMessages: false });
    } else {
      clearActiveSelection();
    }
    setError(null);
    setInfo(infoMessage);
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
      setJobs((prev) => {
        const next = prependJob(prev, result.data);
        jobsRef.current = next;
        return next;
      });
      selectJob(result.data);
      setInfo(t('fixtureSeeded'));
    });
  }

  async function uploadThenExtract(file: File, generation: number) {
    if (offline || !navigator.onLine) {
      setError(t('offlineBlocked'));
      return;
    }

    const mime = normalizeUploadMime(file.type, file.name);
    if (!mime.ok || !isOcrSupportedMime(mime.mimeType)) {
      setError(t('extractFailed', { code: 'file_picker' }));
      return;
    }

    const prepared = await prepareDocumentUploadAction({
      ownerType: 'organization',
      ownerId: organizationId,
      fileName: file.name,
      mimeType: mime.mimeType,
      sizeBytes: file.size,
    });
    if (generation !== uploadGenerationRef.current) {
      if (prepared.documentId) {
        await softDeleteDocumentAction({ documentId: prepared.documentId });
      }
      return;
    }
    if (prepared.error || !prepared.documentId || !prepared.uploadUrl) {
      const stage: DocumentRuntimeStage = prepared.errorCode ?? 'prepare';
      setError(prepared.error ?? t('extractFailed', { code: stage }));
      return;
    }
    if (!prepared.uploadToken && !prepared.uploadUrl) {
      await softDeleteDocumentAction({ documentId: prepared.documentId });
      setError(t('extractFailed', { code: 'signed_target' }));
      return;
    }

    const documentId = prepared.documentId;
    const abandonPending = async () => {
      await softDeleteDocumentAction({ documentId });
    };

    const uploaded = await uploadDocumentBytes(
      {
        uploadUrl: prepared.uploadUrl,
        uploadToken: prepared.uploadToken,
        uploadPath: prepared.uploadPath,
        uploadBucket: prepared.uploadBucket,
      },
      file,
      { contentType: mime.mimeType },
    );
    if (generation !== uploadGenerationRef.current) {
      await abandonPending();
      return;
    }
    if (!uploaded.ok) {
      await abandonPending();
      setError(t('extractFailed', { code: 'storage_upload' }));
      return;
    }

    const finalized = await finalizeDocumentUploadAction({
      documentId,
      sizeBytes: file.size,
    });
    if (generation !== uploadGenerationRef.current) {
      await abandonPending();
      return;
    }
    if (finalized.error) {
      await abandonPending();
      setError(t('extractFailed', { code: finalized.errorCode ?? 'finalize' }));
      return;
    }

    const result = await extractReceiptAction({
      documentId,
      mimeType: mime.mimeType,
      filename: file.name,
      workflow,
    });
    if (generation !== uploadGenerationRef.current) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setJobs((prev) => {
      const next = prependJob(prev, result.data);
      jobsRef.current = next;
      return next;
    });
    selectJob(result.data);
    if (result.data.status === 'failed') {
      setInfo(t('extractFailed', { code: extractionStageCode(result.data) }));
    } else {
      setInfo(t('extractQueuedReview'));
    }
  }

  function onExtractImage(file: File | null) {
    if (!file) return;
    const key = fileUploadKey(file);
    // Same-file `change` can fire twice (picker + clear); ignore the duplicate
    // while that exact file is already uploading.
    if (activeUploadKeyRef.current === key) return;
    const generation = ++uploadGenerationRef.current;
    activeUploadKeyRef.current = key;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        await uploadThenExtract(file, generation);
      } catch {
        if (generation === uploadGenerationRef.current) {
          setError(t('extractFailed', { code: 'file_picker' }));
        }
      } finally {
        if (generation === uploadGenerationRef.current) {
          activeUploadKeyRef.current = null;
        }
      }
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
      setJobs((prev) => {
        const next = prependJob(prev, result.data);
        jobsRef.current = next;
        return next;
      });
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
    const completingId = selected.id;
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
        jobId: completingId,
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
        const createdInfo =
          result.data.draftTarget === 'vendor_bill'
            ? t('vendorBillCreated', { id: result.data.vendorBillId ?? '' })
            : result.data.draftTarget === 'vendor_credit'
              ? t('vendorCreditCreated', { id: result.data.vendorCreditId ?? '' })
              : t('expenseCreated', { id: result.data.expenseId ?? '' });
        leaveTerminalJob(completingId, createdInfo);
      }
    });
  }

  function onReject() {
    if (!selected) return;
    const completingId = selected.id;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await rejectOcrCandidateAction({ jobId: completingId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      leaveTerminalJob(completingId, t('rejected'));
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
            <input
              ref={captureInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              data-pf-ocr-capture-input
              disabled={pending}
              onChange={(event) => {
                onExtractImage(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept={OCR_FILE_ACCEPT}
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              data-pf-ocr-file-input
              disabled={pending}
              onChange={(event) => {
                onExtractImage(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="secondary"
              loading={pending}
              data-pf-ocr-capture
              aria-label={t('extractCapture')}
              onClick={() => openFilePicker(captureInputRef.current)}
            >
              {t('extractCapture')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              loading={pending}
              data-pf-ocr-attach
              aria-label={t('extractImage')}
              onClick={() => openFilePicker(fileInputRef.current)}
            >
              {t('extractImage')}
            </Button>
          </>
        ) : null}
      </div>

      {jobs.length === 0 ? (
        <Alert tone="info">{t('empty')}</Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <ul className="flex flex-col gap-2" aria-label={t('title')}>
            {jobs.map((job) => (
              <li key={job.id}>
                <button
                  type="button"
                  aria-current={job.id === selectedId ? 'true' : undefined}
                  data-pf-ocr-job-id={job.id}
                  data-pf-ocr-job-document-id={job.sourceDocument.documentId ?? ''}
                  className={cn(
                    pressableClassName,
                    'flex w-full min-h-11 items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-start text-sm',
                    job.id === selectedId && 'border-[var(--pf-border-strong)] bg-[var(--pf-bg-muted)]',
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
                    key={sourceDocumentId}
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
          key={sourceDocumentId}
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
