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
import {
  confirmOcrCandidateAction,
  extractReceiptAction,
  rejectOcrCandidateAction,
  seedFixtureOcrJobAction,
} from '@/modules/ocr/application/ocr-actions';
import type {
  ExtractionJob,
  OcrCandidateFieldKey,
  OcrDraftTarget,
  OcrFieldSource,
  OcrProviderStatus,
  ReceiptExtractionCandidates,
} from '@/modules/ocr/domain/types';
import { OCR_CANDIDATE_FIELD_KEYS } from '@/modules/ocr/domain/types';
import { money } from '@/shared/money/money';
import { cn } from '@/shared/ui/cn';

function provenanceSourceLabelKey(source: OcrFieldSource): 'ocr' | 'manual' | 'sample' {
  if (source === 'user_override') return 'manual';
  if (source === 'fixture') return 'sample';
  return 'ocr';
}

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
  readonly canManageDocuments: boolean;
  readonly canCreateExpenses: boolean;
  readonly canManageAp: boolean;
}

export function OcrReviewPanel({
  initialStatus,
  initialJobs,
  canManageDocuments,
  canCreateExpenses,
  canManageAp,
}: OcrReviewPanelProps) {
  const t = useTranslations('documents.ocr');
  const [jobs, setJobs] = useState<ExtractionJob[]>([...initialJobs]);
  const [selectedId, setSelectedId] = useState<string | null>(initialJobs[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draftTarget, setDraftTarget] = useState<OcrDraftTarget>('expense');
  const [vendorId, setVendorId] = useState('');

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

  function onExtractImage(file: File | null) {
    if (!file) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const contentBase64 = btoa(binary);
      const result = await extractReceiptAction({
        contentBase64,
        mimeType: file.type || undefined,
        filename: file.name,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setJobs((prev) => [result.data, ...prev]);
      selectJob(result.data);
      if (result.data.status === 'needs_review') {
        setInfo(t('extractQueuedReview'));
      } else if (result.data.status === 'failed') {
        setInfo(t('extractFailed', { code: result.data.errorCode ?? 'unknown' }));
      } else {
        setInfo(t('extractQueuedReview'));
      }
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
    if (draftTarget === 'vendor_bill' && !vendorId.trim()) {
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
    !selected?.candidates;

  const currencyCode = selected?.candidates
    ? candidateValue(selected.candidates, 'currency').trim().toUpperCase() || 'ILS'
    : 'ILS';

  return (
    <div className="flex flex-col gap-6" dir="auto">
      <Alert
        tone={initialStatus.featureMode === 'live' ? 'info' : 'warning'}
      >
        {t(initialStatus.messageKey)}
      </Alert>

      <p className="text-sm text-[var(--pf-text-secondary)]">{t('honesty')}</p>

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
                'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-3 text-sm active:bg-[var(--pf-action-subtle-active)]',
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
                'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-3 text-sm active:bg-[var(--pf-action-subtle-active)]',
              )}
            >
              <span>{t('extractImage')}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
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
                    'hover:bg-[var(--pf-bg-muted)] active:bg-[var(--pf-action-subtle-active)]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
                  )}
                  onClick={() => selectJob(job)}
                >
                  <span className="truncate font-mono text-xs" dir="ltr">
                    {job.id.slice(0, 8)}
                  </span>
                  <StatusBadge shape={statusShape(job.status)} label={t(`status.${job.status}`)} />
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-md border border-[var(--pf-border-default)] px-3 py-3 text-sm">
                <p className="font-medium">{t('sourceDocument')}</p>
                <p className="mt-1 text-[var(--pf-text-secondary)]">
                  {selected.sourceDocument.filename ?? t('sourceDocumentUnknown')}
                  {selected.sourceDocument.mimeType
                    ? ` · ${selected.sourceDocument.mimeType}`
                    : ''}
                  {selected.sourceDocument.documentId
                    ? ` · ${selected.sourceDocument.documentId.slice(0, 8)}`
                    : ''}
                </p>
                <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{t('sourceRetained')}</p>
                {selected.providerId ? (
                  <p className="mt-1 text-xs text-[var(--pf-text-secondary)]" dir="ltr">
                    {t('providerLabel', { id: selected.providerId })}
                    {selected.overallConfidence != null
                      ? ` · ${t('confidence', {
                          value: String(Math.round(selected.overallConfidence * 100)),
                        })}`
                      : ''}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
                  {t('reviewStatusLabel', {
                    status: t(`reviewStatus.${selected.reviewStatus}`),
                  })}
                </p>
              </div>

              {selected.candidates ? (
                <>
                  {OCR_CANDIDATE_FIELD_KEYS.map((field) => {
                    const value = candidateValue(selected.candidates!, field);
                    const showMoneyPreview =
                      MONEY_FIELDS.has(field) && MONEY_PATTERN.test(value.trim());
                    return (
                      <div key={field} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor={`ocr-${field}`}>{t(`fields.${field}`)}</Label>
                          <label className="flex min-h-11 items-center gap-2 text-xs text-[var(--pf-text-secondary)]">
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
                        <Input
                          id={`ocr-${field}`}
                          value={value}
                          disabled={reviewLocked}
                          numeric={MONEY_FIELDS.has(field) || field === 'currency'}
                          type={DATE_FIELDS.has(field) ? 'date' : 'text'}
                          dir={
                            field === 'currency' ||
                            field === 'reference' ||
                            MONEY_FIELDS.has(field)
                              ? 'ltr'
                              : undefined
                          }
                          aria-describedby={`ocr-${field}-meta`}
                          onChange={(event) =>
                            setOverrides((prev) => ({ ...prev, [field]: event.target.value }))
                          }
                        />
                        {showMoneyPreview ? (
                          <p className="text-sm" dir="ltr">
                            <MoneyText value={money(value.trim(), currencyCode)} />
                          </p>
                        ) : null}
                        <p
                          id={`ocr-${field}-meta`}
                          className="text-xs text-[var(--pf-text-secondary)]"
                        >
                          {t('confidence', {
                            value:
                              selected.candidates![field].confidence == null
                                ? '—'
                                : String(
                                    Math.round(
                                      (selected.candidates![field].confidence ?? 0) * 100,
                                    ),
                                  ),
                          })}
                          {' · '}
                          {t('provenance', {
                            source: t(
                              `sources.${provenanceSourceLabelKey(
                                selected.candidates![field].provenance.source,
                              )}`,
                            ),
                          })}
                          {selected.extractedCandidates?.[field] &&
                          selected.candidates![field].provenance.source === 'user_override' ? (
                            <>
                              {' · '}
                              {t('extractedProvenance', {
                                source: t(
                                  `sources.${provenanceSourceLabelKey(
                                    selected.extractedCandidates[field].provenance.source,
                                  )}`,
                                ),
                              })}
                            </>
                          ) : null}
                        </p>
                      </div>
                    );
                  })}

                  {selected.candidates.lineDescriptions.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-medium">{t('lineDescriptions')}</p>
                      <p className="text-xs text-[var(--pf-text-secondary)]">
                        {t('lineDescriptionsHint')}
                      </p>
                      <ul className="list-disc ps-5 text-sm text-[var(--pf-text-secondary)]">
                        {selected.candidates.lineDescriptions.map((line, index) => (
                          <li key={`line-${index}`}>
                            {line.value ?? '—'}
                            {line.confidence != null
                              ? ` (${Math.round(line.confidence * 100)}%)`
                              : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2 rounded-md border border-dashed border-[var(--pf-border-default)] px-3 py-3">
                    <p className="text-sm font-medium">{t('suggestionsTitle')}</p>
                    <p className="text-xs text-[var(--pf-text-secondary)]">{t('suggestionsHint')}</p>
                    <p className="text-sm">
                      {t('suggestionProject')}:{' '}
                      {selected.candidates.suggestions.projectLabel?.value ?? '—'}
                    </p>
                    <p className="text-sm">
                      {t('suggestionCategory')}:{' '}
                      {selected.candidates.suggestions.categoryLabel?.value ?? '—'}
                    </p>
                  </div>

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
                    </div>
                    {draftTarget === 'vendor_bill' ? (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="ocr-vendor-entity">{t('vendorEntity')}</Label>
                        <Input
                          id="ocr-vendor-entity"
                          value={vendorId}
                          disabled={reviewLocked || pending}
                          dir="ltr"
                          placeholder={t('vendorEntityPlaceholder')}
                          onChange={(event) => setVendorId(event.target.value)}
                        />
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
                        : t('confirmExpense')}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11"
                      disabled={
                        pending ||
                        !canManageDocuments ||
                        selected.status === 'succeeded' ||
                        selected.status === 'rejected' ||
                        Boolean(selected.confirmedExpenseId) ||
                        Boolean(selected.confirmedVendorBillId)
                      }
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
          ) : null}
        </div>
      )}
    </div>
  );
}
