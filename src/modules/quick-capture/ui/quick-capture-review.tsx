'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { DocumentInlinePreview } from '@/modules/documents/ui/document-inline-preview';
import {
  OCR_CANDIDATE_FIELD_KEYS,
  type ExtractionJob,
  type OcrCandidateFieldKey,
  type OcrDraftTarget,
  type OcrProviderStatus,
} from '@/modules/ocr/domain/types';
import { useRouter } from '@/shared/i18n/navigation';
import type { CaptureReviewData } from '../application/load-capture-review';
import {
  approveQuickCaptureAction,
  pollCaptureOcrAction,
  rejectQuickCaptureAction,
  startCaptureFinancialOcrAction,
} from '../application/quick-capture-actions';
import { FIELD_MEDIA_CATEGORIES, type FieldMediaCategory } from '../domain/field-media-categories';
import { resolveQuickCaptureOcrErrorKey } from '../domain/resolve-ocr-error-key';
import type { DetectedType } from '../domain/types';
import { displayCostCategoryName } from '@/modules/expenses/domain/cost-category-display';
import { QuickCaptureGallery } from './quick-capture-gallery';
import { QuickCaptureProjectSelect } from './quick-capture-project-select';
import { QuickCaptureVideoPreview } from './quick-capture-video-preview';

type FinancialExpenseMode = 'project' | 'company';

function resolveFinancialApprovalHref(
  routedEntityType: string | null | undefined,
  routedEntityId: string | null | undefined,
): string | null {
  if (!routedEntityType || !routedEntityId) return null;
  switch (routedEntityType) {
    case 'expense':
      return `/expenses/${routedEntityId}?quickCaptureApproved=1`;
    case 'vendor_bill':
      return `/procurement/ap/${routedEntityId}?quickCaptureApproved=1`;
    case 'vendor_credit':
      return `/procurement/ap/credits/${routedEntityId}?quickCaptureApproved=1`;
    default:
      return null;
  }
}

const OCR_SLOW_MS = 45_000;

function isTerminalOcrStatus(status: string | undefined): boolean {
  return (
    status === 'needs_review' ||
    status === 'failed' ||
    status === 'rejected' ||
    status === 'cancelled'
  );
}

function isActiveOcrStatus(status: string | undefined): boolean {
  return status === 'queued' || status === 'processing' || status === 'running';
}

const OcrReviewPanelLazy = dynamic(
  () =>
    import('@/modules/ocr/ui/ocr-review-panel-lazy').then((mod) => mod.OcrReviewPanelLazy),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-32 items-center justify-center">
        <Spinner />
      </div>
    ),
  },
);

export function QuickCaptureReview({
  initialData,
}: {
  readonly initialData: CaptureReviewData;
}) {
  const t = useTranslations('quickCapture');
  const tExpenses = useTranslations('expenses');
  const tOcrErrors = useTranslations('quickCapture.review.ocrErrors');
  const tField = useTranslations('quickCapture.fieldMedia');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const capture = initialData.capture;
  const [ocrJob, setOcrJob] = useState<ExtractionJob | null>(initialData.ocrJob);
  const [ownerType, setOwnerType] = useState<DetectedType>(
    capture.ownerSelectedType ??
      capture.detectedType ??
      (capture.sessionKind === 'video' ? 'field_media' : 'unknown'),
  );
  const [selectedFinancialDocumentId, setSelectedFinancialDocumentId] = useState<string | null>(
    capture.selectedFinancialDocumentId ??
      (capture.documentCount === 1 ? initialData.documents[0]?.documentId ?? null : null),
  );
  const [projectId, setProjectId] = useState(
    capture.explicitProjectId ?? capture.suggestedProjectId ?? '',
  );
  const [financialExpenseMode, setFinancialExpenseMode] = useState<FinancialExpenseMode>('company');
  const [financialProjectId, setFinancialProjectId] = useState(
    capture.explicitProjectId ?? '',
  );
  const [financialCostCategoryId, setFinancialCostCategoryId] = useState('');
  const [category, setCategory] = useState<FieldMediaCategory>('progress');
  const [error, setError] = useState<string | null>(null);
  const [ocrParsing, setOcrParsing] = useState(false);
  const [ocrSlow, setOcrSlow] = useState(false);
  const [ocrPollHalted, setOcrPollHalted] = useState(false);
  const ocrRunningStartedAtRef = useRef<number | null>(null);

  const isVideo = capture.sessionKind === 'video';
  const isMultiImage = capture.sessionKind === 'images' && capture.documentCount > 1;
  const soleDocument = initialData.documents.length === 1 ? initialData.documents[0] : null;

  const financialOcrReady = ocrJob?.status === 'needs_review';
  const financialOcrFailed =
    ocrJob?.status === 'failed' || ocrJob?.status === 'rejected' || ocrJob?.status === 'cancelled';
  const financialOcrRunning =
    ocrJob?.status === 'queued' ||
    ocrJob?.status === 'processing' ||
    ocrJob?.status === 'running';

  useEffect(() => {
    if (ownerType !== 'financial_document' || !financialOcrRunning || ocrPollHalted) {
      if (!financialOcrRunning) {
        ocrRunningStartedAtRef.current = null;
        setOcrSlow(false);
      }
      return;
    }

    if (ocrRunningStartedAtRef.current == null) {
      ocrRunningStartedAtRef.current = Date.now();
    }

    let cancelled = false;
    const tick = async () => {
      const startedAt = ocrRunningStartedAtRef.current ?? Date.now();
      if (Date.now() - startedAt >= OCR_SLOW_MS) {
        setOcrSlow(true);
        setOcrParsing(false);
      }

      const result = await pollCaptureOcrAction(capture.id);
      if (cancelled) return;

      if (!result.ok) {
        setOcrPollHalted(true);
        setOcrParsing(false);
        setOcrSlow(false);
        setError(result.error ?? t('review.pollFailed'));
        return;
      }

      setError(null);
      setOcrJob(result.data.job);
      const status = result.data.job?.status;
      if (isTerminalOcrStatus(status)) {
        setOcrParsing(false);
        setOcrSlow(false);
        setOcrPollHalted(true);
      } else if (isActiveOcrStatus(status)) {
        setOcrPollHalted(false);
      }
    };

    const timer = window.setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [capture.id, ownerType, financialOcrRunning, ocrPollHalted, t]);

  const ocrPanelJobs = useMemo(
    () => (ocrJob && ownerType === 'financial_document' ? [ocrJob] : []),
    [ocrJob, ownerType],
  );

  const projectCostCategories = useMemo(
    () =>
      initialData.costCategories
        .filter((row) => row.family === 'direct_project')
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [initialData.costCategories],
  );

  const suggestedProjectName = useMemo(() => {
    if (!capture.suggestedProjectId || capture.explicitProjectId) return null;
    return initialData.projects.find((project) => project.id === capture.suggestedProjectId)?.name ?? null;
  }, [capture.explicitProjectId, capture.suggestedProjectId, initialData.projects]);

  const handleSelectFinancialDocument = (documentId: string) => {
    setSelectedFinancialDocumentId(documentId);
    setError(null);
    if (!initialData.ocrLive) {
      setError(t('review.ocrUnavailable'));
      return;
    }
    setOcrParsing(true);
    startTransition(async () => {
      const result = await startCaptureFinancialOcrAction({
        captureId: capture.id,
        documentId,
      });
      if (!result.ok) {
        setError(result.error);
        setOcrParsing(false);
        return;
      }
      await refreshOcrJobAfterStart();
    });
  };

  const refreshOcrJobAfterStart = async () => {
    const polled = await pollCaptureOcrAction(capture.id);
    if (!polled.ok) {
      setOcrPollHalted(true);
      setOcrParsing(false);
      setError(polled.error ?? t('review.pollFailed'));
      return;
    }
    const job = polled.data.job;
    setOcrJob(job);
    if (isTerminalOcrStatus(job?.status)) {
      setOcrParsing(false);
      setOcrPollHalted(true);
      return;
    }
    if (isActiveOcrStatus(job?.status)) {
      setOcrPollHalted(false);
    }
  };

  const handleRetryOcr = () => {
    if (!selectedFinancialDocumentId) return;
    setError(null);
    setOcrSlow(false);
    setOcrPollHalted(false);
    ocrRunningStartedAtRef.current = Date.now();
    setOcrParsing(true);
    startTransition(async () => {
      const result = await startCaptureFinancialOcrAction({
        captureId: capture.id,
        documentId: selectedFinancialDocumentId,
        forceRetry: true,
      });
      if (!result.ok) {
        setError(result.error);
        setOcrParsing(false);
        return;
      }
      await refreshOcrJobAfterStart();
    });
  };

  const ocrFailureMessage =
    financialOcrFailed && ocrJob
      ? tOcrErrors(resolveQuickCaptureOcrErrorKey(ocrJob))
      : null;

  const showOcrRetry =
    ownerType === 'financial_document' &&
    selectedFinancialDocumentId &&
    (financialOcrFailed || ocrSlow || (ocrPollHalted && Boolean(error)));

  const approveDisabled =
    pending ||
    capture.status !== 'ready_for_review' ||
    (ownerType === 'financial_document' &&
      (!financialOcrReady ||
        !ocrJob ||
        (isMultiImage && !selectedFinancialDocumentId) ||
        (financialExpenseMode === 'project' && !financialProjectId))) ||
    (ownerType === 'field_media' && !projectId) ||
    (ownerType === 'other_document' && !projectId);

  const handleApprove = () => {
    setError(null);
    startTransition(async () => {
      if (ownerType === 'financial_document') {
        if (!ocrJob) {
          setError(t('review.ocrUnavailable'));
          return;
        }
        const acceptedFields = OCR_CANDIDATE_FIELD_KEYS.filter((key: OcrCandidateFieldKey) => {
          const value = ocrJob.candidates?.[key]?.value;
          return value != null && String(value).trim() !== '';
        });
        const result = await approveQuickCaptureAction({
          captureId: capture.id,
          ownerSelectedType: 'financial_document',
          expenseAssignment:
            financialExpenseMode === 'project'
              ? {
                  mode: 'project',
                  projectId: financialProjectId,
                  costCategoryId: financialCostCategoryId.trim() || null,
                }
              : { mode: 'company' },
          confirmInput: {
            jobId: ocrJob.id,
            confirm: true,
            draftTarget: 'expense' as OcrDraftTarget,
            acceptedFields,
          },
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const destination = resolveFinancialApprovalHref(
          result.data.routedEntityType,
          result.data.routedEntityId,
        );
        if (destination) {
          router.push(destination);
          return;
        }
      } else if (ownerType === 'field_media') {
        const result = await approveQuickCaptureAction({
          captureId: capture.id,
          ownerSelectedType: 'field_media',
          projectId,
          category,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else if (ownerType === 'other_document') {
        const result = await approveQuickCaptureAction({
          captureId: capture.id,
          ownerSelectedType: 'other_document',
          ownerType: 'project',
          ownerId: projectId,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else {
        setError(t('errors.unsupportedApprovalType'));
        return;
      }
      router.push('/quick-capture/inbox');
    });
  };

  const handleReject = (mode: 'reject' | 'archive') => {
    setError(null);
    startTransition(async () => {
      const result = await rejectQuickCaptureAction({ captureId: capture.id, mode });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/quick-capture/inbox');
    });
  };

  const ocrProviderStatus = useMemo<OcrProviderStatus>(
    () =>
      initialData.ocrLive
        ? {
            providerId: 'azure',
            configured: true,
            featureMode: 'live',
            ingestionEnabled: true,
            messageKey: 'providerLiveReady',
          }
        : {
            providerId: 'stub',
            configured: false,
            featureMode: 'disabled',
            ingestionEnabled: false,
            messageKey: 'featureDisabled',
          },
    [initialData.ocrLive],
  );

  const hasPreview =
    capture.sessionKind === 'images' ||
    (isVideo && soleDocument) ||
    ((capture.sessionKind === 'pdf' || capture.sessionKind === 'file') && soleDocument);

  return (
    <div className="mx-auto flex w-full max-w-[88rem] flex-col gap-6">
      {hasPreview ? (
        <div className="flex w-full flex-col gap-4 lg:items-center">
          <div className="w-full lg:mx-auto lg:max-w-[28rem]">
            {capture.sessionKind === 'images' ? (
              <QuickCaptureGallery
                documents={initialData.documents}
                selectable={ownerType === 'financial_document' && isMultiImage}
                selectedDocumentId={selectedFinancialDocumentId}
                onSelectDocument={handleSelectFinancialDocument}
              />
            ) : null}

            {isVideo && soleDocument ? (
              <QuickCaptureVideoPreview
                documentId={soleDocument.documentId}
                mimeType={soleDocument.mimeType}
              />
            ) : null}

            {(capture.sessionKind === 'pdf' || capture.sessionKind === 'file') && soleDocument ? (
              <DocumentInlinePreview
                documentId={soleDocument.documentId}
                filename={soleDocument.fileName}
                mimeType={soleDocument.mimeType}
              />
            ) : null}
          </div>

          {capture.ownerNote ? (
            <div className="w-full rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm lg:max-w-[88rem]">
              {capture.ownerNote}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-w-0 w-full flex-col gap-4">
        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}

        {capture.status === 'failed' ? (
          <Alert tone="warning">{t('inbox.statusFailed')}</Alert>
        ) : null}

        <Field label={t('review.changeType')}>
          {(control) => (
            <Select
              value={ownerType}
              onValueChange={(value) => setOwnerType(value as DetectedType)}
              disabled={pending || isVideo}
            >
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!isVideo ? (
                  <SelectItem value="financial_document">{t('review.financialDocument')}</SelectItem>
                ) : null}
                <SelectItem value="field_media">
                  {isVideo ? tField('videoTitle') : t('review.fieldMedia')}
                </SelectItem>
                {!isVideo ? (
                  <SelectItem value="other_document">{t('review.otherDocument')}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          )}
        </Field>

        {ownerType === 'financial_document' && isMultiImage ? (
          <Alert tone="info">{t('review.selectFinancialDocument')}</Alert>
        ) : null}

        {ownerType === 'financial_document' &&
        (ocrParsing || financialOcrRunning) &&
        !ocrSlow &&
        !ocrPollHalted ? (
          <Alert tone="info" role="status">
            <Spinner className="me-2 inline" />
            {t('review.parsingDocument')}
          </Alert>
        ) : null}

        {ownerType === 'financial_document' && ocrSlow && financialOcrRunning ? (
          <Alert tone="warning" role="status">
            {t('review.parsingSlow')}
          </Alert>
        ) : null}

        {ownerType === 'financial_document' && financialOcrFailed ? (
          <Alert tone="warning">{ocrFailureMessage ?? t('review.ocrFailed')}</Alert>
        ) : null}

        {showOcrRetry ? (
          <Button type="button" variant="secondary" disabled={pending} onClick={handleRetryOcr}>
            {t('review.retryOcr')}
          </Button>
        ) : null}

        {ownerType === 'financial_document' && financialOcrReady && ocrPanelJobs.length > 0 ? (
          <OcrReviewPanelLazy
            embedded
            initialStatus={ocrProviderStatus}
            initialJobs={ocrPanelJobs}
            vendors={initialData.vendors}
            organizationId={initialData.organizationId}
            organizationTaxId={initialData.organizationTaxId}
            defaultTarget="expense"
            workflow="general"
            canManageDocuments={initialData.canManageDocuments}
            canCreateExpenses={initialData.canCreateExpenses}
            canManageAp={initialData.canManageAp}
            initialSelectedJobId={ocrJob?.id ?? null}
          />
        ) : null}

        {ownerType === 'financial_document' && financialOcrReady ? (
          <div className="flex flex-col gap-4 rounded-md border border-[var(--pf-border-default)] p-4">
            <p className="text-sm font-medium">{t('review.expenseAssignment.title')}</p>
            <Field label={t('review.expenseAssignment.modeLabel')}>
              {(control) => (
                <Select
                  value={financialExpenseMode}
                  onValueChange={(value) => setFinancialExpenseMode(value as FinancialExpenseMode)}
                  disabled={pending}
                >
                  <SelectTrigger id={control.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">{t('review.expenseAssignment.project')}</SelectItem>
                    <SelectItem value="company">{t('review.expenseAssignment.company')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>

            {financialExpenseMode === 'project' ? (
              <>
                <Field label={t('review.expenseAssignment.projectLabel')}>
                  {(control) => (
                    <Select
                      value={financialProjectId}
                      onValueChange={setFinancialProjectId}
                      disabled={pending}
                    >
                      <SelectTrigger id={control.id}>
                        <SelectValue placeholder={t('review.expenseAssignment.projectPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {initialData.projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
                {suggestedProjectName ? (
                  <p className="text-sm text-[var(--pf-text-secondary)]">
                    {t('review.expenseAssignment.suggestedProject', { name: suggestedProjectName })}
                  </p>
                ) : null}
                <Field
                  label={t('review.expenseAssignment.costCategoryLabel')}
                  description={t('review.expenseAssignment.costCategoryOptionalHint')}
                >
                  {(control) => (
                    <Select
                      value={financialCostCategoryId || '__none__'}
                      onValueChange={(value) =>
                        setFinancialCostCategoryId(value === '__none__' ? '' : value)
                      }
                      disabled={pending}
                    >
                      <SelectTrigger id={control.id}>
                        <SelectValue placeholder={t('review.expenseAssignment.costCategoryPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          {t('review.expenseAssignment.costCategoryOptionalPlaceholder')}
                        </SelectItem>
                        {projectCostCategories.map((row) => (
                          <SelectItem key={row.id} value={row.id}>
                            {displayCostCategoryName(row, (key) => tExpenses(key))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              </>
            ) : (
              <p className="text-sm text-[var(--pf-text-secondary)]">
                {t('review.expenseAssignment.companyHint')}
              </p>
            )}
          </div>
        ) : null}

        {ownerType === 'field_media' || ownerType === 'other_document' ? (
          <QuickCaptureProjectSelect
            projects={initialData.projects}
            value={projectId}
            onValueChange={setProjectId}
            disabled={pending}
          />
        ) : null}

        {ownerType === 'field_media' ? (
          <Field label={tField('category')}>
            {(control) => (
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as FieldMediaCategory)}
                disabled={pending}
              >
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_MEDIA_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {tField(`categories.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            className="min-h-11"
            disabled={approveDisabled}
            onClick={handleApprove}
          >
            {pending ? <Spinner className="me-2" /> : null}
            {t('review.approve')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={pending}
            onClick={() => handleReject('reject')}
          >
            {t('review.reject')}
          </Button>
        </div>
      </div>
    </div>
  );
}
