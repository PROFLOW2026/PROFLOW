'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState, useTransition } from 'react';
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
import type { DetectedType } from '../domain/types';
import { QuickCaptureGallery } from './quick-capture-gallery';
import { QuickCaptureProjectSelect } from './quick-capture-project-select';
import { QuickCaptureVideoPreview } from './quick-capture-video-preview';

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
  const [category, setCategory] = useState<FieldMediaCategory>('progress');
  const [error, setError] = useState<string | null>(null);
  const [ocrParsing, setOcrParsing] = useState(false);

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
    if (ownerType !== 'financial_document') return;
    if (!financialOcrRunning) return;
    let cancelled = false;
    const tick = async () => {
      const result = await pollCaptureOcrAction(capture.id);
      if (cancelled || !result.ok) return;
      setOcrJob(result.data.job);
      if (
        result.data.job?.status === 'needs_review' ||
        result.data.job?.status === 'failed' ||
        result.data.job?.status === 'rejected'
      ) {
        setOcrParsing(false);
      }
    };
    const timer = window.setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [capture.id, ownerType, financialOcrRunning]);

  const ocrPanelJobs = useMemo(
    () => (ocrJob && ownerType === 'financial_document' ? [ocrJob] : []),
    [ocrJob, ownerType],
  );

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
      const polled = await pollCaptureOcrAction(capture.id);
      if (polled.ok) setOcrJob(polled.data.job);
    });
  };

  const handleRetryOcr = () => {
    if (!selectedFinancialDocumentId) return;
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
      const polled = await pollCaptureOcrAction(capture.id);
      if (polled.ok) setOcrJob(polled.data.job);
    });
  };

  const approveDisabled =
    pending ||
    capture.status !== 'ready_for_review' ||
    (ownerType === 'financial_document' &&
      (!financialOcrReady || !ocrJob || (isMultiImage && !selectedFinancialDocumentId))) ||
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

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      <div className="flex flex-col gap-4">
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

        {capture.ownerNote ? (
          <div className="rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm">
            {capture.ownerNote}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
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

        {ownerType === 'financial_document' && (ocrParsing || financialOcrRunning) ? (
          <Alert tone="info" role="status">
            <Spinner className="me-2 inline" />
            {t('review.parsingDocument')}
          </Alert>
        ) : null}

        {ownerType === 'financial_document' && financialOcrFailed ? (
          <div className="flex flex-col gap-2">
            <Alert tone="warning">{t('review.ocrUnavailable')}</Alert>
            <Button type="button" variant="secondary" disabled={pending} onClick={handleRetryOcr}>
              {t('review.retryOcr')}
            </Button>
          </div>
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
