'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { pressableClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  cancelOcrJobAction,
  confirmOcrCandidateAction,
  createOcrBatchAction,
  extractReceiptAction,
  getOcrReviewPageDataAction,
  getOcrReviewSuggestionsAction,
  rejectOcrCandidateAction,
  seedFixtureOcrJobAction,
} from '@/modules/ocr/application/ocr-actions';
import type { OcrReviewSuggestions } from '@/modules/ocr/application/load-review-suggestions';
import {
  countOcrInboxTabs,
  defaultOcrInboxTab,
  isOcrActiveQueueStatus,
  jobsForOcrInboxTab,
  OCR_INBOX_TABS,
  ocrInboxTabForStatus,
  type OcrInboxTab,
} from '@/modules/ocr/domain/review-queue';
import { recountOcrBatchFromJobs } from '@/modules/ocr/domain/job-lifecycle';
import { confidenceState } from '@/modules/ocr/domain/confidence';
import { collectReviewWarnings } from '@/modules/ocr/domain/totals-warnings';
import { suggestedDraftTarget } from '@/modules/ocr/domain/canonical';
import { isOcrSupportedMime } from '@/modules/ocr/domain/cost-controls';
import type {
  ExtractionJob,
  OcrBatch,
  OcrCandidateFieldKey,
  OcrDocumentTypeKey,
  OcrDraftTarget,
  OcrDuplicateHit,
  OcrProviderStatus,
  OcrWorkflowContext,
  ReceiptExtractionCandidates,
} from '@/modules/ocr/domain/types';
import { OCR_CANDIDATE_FIELD_KEYS } from '@/modules/ocr/domain/types';
import { money } from '@/shared/money/money';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

function statusShape(
  status: ExtractionJob['status'],
): 'pending' | 'onHold' | 'completed' | 'rejected' {
  if (status === 'needs_review') return 'onHold';
  if (status === 'failed' || status === 'rejected' || status === 'cancelled') return 'rejected';
  if (status === 'succeeded') return 'completed';
  return 'pending';
}

const MONEY_FIELDS = new Set<OcrCandidateFieldKey>([
  'subtotal',
  'discount',
  'net',
  'tax',
  'vatRate',
  'gross',
  'amountDue',
]);
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

const EMPTY_SUGGESTIONS: OcrReviewSuggestions = {
  projects: [],
  purchaseOrders: [],
  subcontractAgreements: [],
};

function duplicateHitHref(hit: OcrDuplicateHit): string | null {
  if (hit.expenseId) return `/expenses/${hit.expenseId}`;
  if (hit.vendorBillId) return `/procurement/ap/${hit.vendorBillId}`;
  return null;
}

export interface OcrReviewPanelProps {
  readonly initialStatus: OcrProviderStatus;
  readonly initialJobs: readonly ExtractionJob[];
  readonly initialBatches?: readonly OcrBatch[];
  readonly vendors: readonly { id: string; name: string }[];
  readonly organizationId: string;
  /** Organization tax/company ID from legal_identity settings — wrong-customer checks. */
  readonly organizationTaxId?: string | null;
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
  initialBatches = [],
  vendors,
  organizationId,
  organizationTaxId = null,
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
  const initialInboxTab = defaultOcrInboxTab(activeInitialJobs);
  const [jobs, setJobs] = useState<ExtractionJob[]>(() => [...activeInitialJobs]);
  const [inboxTab, setInboxTab] = useState<OcrInboxTab>(initialInboxTab);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const inDefaultTab = jobsForOcrInboxTab(activeInitialJobs, initialInboxTab);
    const remembered = ocrSelectionMemory.get(organizationId);
    if (remembered && inDefaultTab.some((job) => job.id === remembered)) {
      return remembered;
    }
    return inDefaultTab[0]?.id ?? null;
  });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draftTarget, setDraftTarget] = useState<OcrDraftTarget>(defaultTarget);
  const [vendorId, setVendorId] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [linkedPreviewDocumentId, setLinkedPreviewDocumentId] = useState<string | null>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadGenerationRef = useRef(0);
  const activeUploadKeyRef = useRef<string | null>(null);
  const jobsRef = useRef(jobs);
  const selectedIdRef = useRef(selectedId);
  const [batches, setBatches] = useState<OcrBatch[]>(() => [...initialBatches]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const inFlight = jobs.some(
    (job) => job.status === 'queued' || job.status === 'running' || job.status === 'processing',
  );

  useEffect(() => {
    if (!inFlight) return;
    let cancelled = false;
    const tick = async () => {
      const result = await getOcrReviewPageDataAction();
      if (cancelled || !result.ok) return;
      const nextJobs = result.data.jobs.filter((job) => isOcrActiveQueueStatus(job.status));
      jobsRef.current = nextJobs;
      setJobs(nextJobs);
      setBatches([...result.data.batches]);
      const current = nextJobs.find((job) => job.id === selectedIdRef.current);
      const tab = current ? ocrInboxTabForStatus(current.status) : null;
      if (tab) setInboxTab(tab);
    };
    const timer = window.setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [inFlight]);

  const liveExtract = initialStatus.ingestionEnabled && initialStatus.featureMode === 'live';
  const fixtureTools = initialStatus.featureMode === 'fixture_only';

  const selected = useMemo(
    () => jobs.find((job) => job.id === selectedId) ?? null,
    [jobs, selectedId],
  );
  const duplicateHits = selected?.rawMetadata?.duplicateHits ?? [];
  const vendorMatches = selected?.rawMetadata?.vendorMatches ?? [];

  const [overrides, setOverrides] = useState<Partial<Record<OcrCandidateFieldKey, string>>>(() => {
    const remembered = ocrSelectionMemory.get(organizationId);
    const initial =
      (remembered ? activeInitialJobs.find((job) => job.id === remembered) : undefined) ??
      activeInitialJobs[0] ??
      null;
    return hydrateOverrides(initial);
  });
  const [accepted, setAccepted] = useState<Partial<Record<OcrCandidateFieldKey, boolean>>>({});
  const [rememberProjectId, setRememberProjectId] = useState('');
  const [rememberPurchaseOrderId, setRememberPurchaseOrderId] = useState('');
  const [rememberSubcontractAgreementId, setRememberSubcontractAgreementId] = useState('');
  const [duplicateOverride, setDuplicateOverride] = useState(false);
  const [suggestions, setSuggestions] = useState<OcrReviewSuggestions>(EMPTY_SUGGESTIONS);

  useEffect(() => {
    if (!selected?.candidates) return;
    let cancelled = false;
    void getOcrReviewSuggestionsAction({
      vendorId: vendorId.trim() || null,
      vendorName: selected.candidates.vendor.value,
      companyNumber: selected.candidates.companyNumber.value,
      vatId: selected.candidates.vatId.value,
      projectId: rememberProjectId.trim() || null,
      orderNumber: selected.candidates.orderNumber.value,
      currency: selected.candidates.currency.value,
    }).then((result) => {
      if (cancelled) return;
      setSuggestions(result.ok ? result.data : EMPTY_SUGGESTIONS);
    });
    return () => {
      cancelled = true;
    };
  }, [selected, vendorId, rememberProjectId]);

  const inboxCounts = useMemo(() => countOcrInboxTabs(jobs), [jobs]);
  const inboxJobs = useMemo(() => jobsForOcrInboxTab(jobs, inboxTab), [jobs, inboxTab]);

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
    setLinkedPreviewDocumentId(null);
    setSelectedId(job.id);
    setOverrides(hydrateOverrides(job));
    setAccepted({});
    setRememberProjectId('');
    setRememberPurchaseOrderId('');
    setRememberSubcontractAgreementId('');
    setDuplicateOverride(false);
    setSuggestions(EMPTY_SUGGESTIONS);
    const tab = ocrInboxTabForStatus(job.status);
    if (tab) setInboxTab(tab);
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
    setLinkedPreviewDocumentId(null);
    setSelectedId(null);
    setOverrides({});
    setAccepted({});
    setVendorId('');
    setDraftTarget(defaultTarget);
    setRememberProjectId('');
    setRememberPurchaseOrderId('');
    setRememberSubcontractAgreementId('');
    setDuplicateOverride(false);
    setSuggestions(EMPTY_SUGGESTIONS);
    setInboxTab(defaultOcrInboxTab([]));
  }

  function selectInboxTab(tab: OcrInboxTab) {
    setInboxTab(tab);
    const inTab = jobsForOcrInboxTab(jobsRef.current, tab);
    if (selectedId && inTab.some((job) => job.id === selectedId)) return;
    if (inTab[0]) {
      applyJobSelection(inTab[0]);
    } else {
      ocrSelectionMemory.delete(organizationId);
      setPreviewOpen(false);
      setLinkedPreviewDocumentId(null);
      setSelectedId(null);
      setOverrides({});
      setAccepted({});
      setVendorId('');
      setDraftTarget(defaultTarget);
      setRememberProjectId('');
      setRememberPurchaseOrderId('');
      setRememberSubcontractAgreementId('');
      setDuplicateOverride(false);
      setSuggestions(EMPTY_SUGGESTIONS);
    }
  }

  function selectJob(job: ExtractionJob) {
    applyJobSelection(job);
  }

  /** Terminal confirm/reject: drop from active queue and move to the next actionable job. */
  function leaveTerminalJob(completedId: string, infoMessage: string) {
    const prev = jobsRef.current;
    const completed = prev.find((job) => job.id === completedId);
    const remaining = prev.filter((job) => job.id !== completedId);
    const completedTab = completed ? ocrInboxTabForStatus(completed.status) : null;
    const sameTab = completedTab ? jobsForOcrInboxTab(remaining, completedTab) : [];
    const fallbackTab = defaultOcrInboxTab(remaining);
    const next =
      sameTab[0] ?? jobsForOcrInboxTab(remaining, fallbackTab)[0] ?? remaining[0] ?? null;

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

  async function uploadThenExtract(file: File, generation: number, batchId?: string) {
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
      batchId,
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
    } else if (
      result.data.status === 'queued' ||
      result.data.status === 'processing' ||
      result.data.status === 'running'
    ) {
      setInfo(t('extractQueuedBackground'));
    } else {
      setInfo(t('extractQueuedReview'));
    }
  }

  function onExtractImage(file: File | null) {
    if (!file) return;
    onExtractImages([file]);
  }

  function onExtractImages(files: File[]) {
    if (files.length === 0) return;
    const key = files.map(fileUploadKey).join('|');
    if (activeUploadKeyRef.current === key) return;
    const generation = ++uploadGenerationRef.current;
    activeUploadKeyRef.current = key;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        if (files.length === 1) {
          await uploadThenExtract(files[0]!, generation);
          return;
        }
        const batchResult = await createOcrBatchAction({ totalCount: files.length });
        if (!batchResult.ok) {
          setError(batchResult.error);
          return;
        }
        setBatches((prev) => [batchResult.data.batch, ...prev.filter((item) => item.id !== batchResult.data.batch.id)]);
        for (const file of files) {
          if (generation !== uploadGenerationRef.current) return;
          await uploadThenExtract(file, generation, batchResult.data.batch.id);
        }
        setInfo(t('batchQueued', { count: files.length }));
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
        batchId: selected.batchId ?? undefined,
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
      if (
        result.data.status === 'queued' ||
        result.data.status === 'processing' ||
        result.data.status === 'running'
      ) {
        setInfo(t('extractQueuedBackground'));
      }
    });
  }

  function onCancelQueued() {
    if (!selected || selected.status !== 'queued') return;
    startTransition(async () => {
      const result = await cancelOcrJobAction({ jobId: selected.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      leaveTerminalJob(selected.id, t('jobCancelled'));
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
    if (duplicateHits.length > 0 && !duplicateOverride) {
      setError(t('duplicateOverrideRequired'));
      return;
    }
    startTransition(async () => {
      const result = await confirmOcrCandidateAction({
        jobId: completingId,
        confirm: true,
        draftTarget,
        vendorId: vendorId.trim() || null,
        rememberProjectId: rememberProjectId.trim() || null,
        rememberPurchaseOrderId: rememberPurchaseOrderId.trim() || null,
        rememberSubcontractAgreementId: rememberSubcontractAgreementId.trim() || null,
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
        organizationTaxId,
        customerTaxId: selected.rawMetadata?.customer?.taxId ?? null,
      })
    : [];
  const sourceDocumentId = selected?.sourceDocument.documentId;
  const visibleBatches = useMemo(() => {
    const ids = new Set(jobs.map((job) => job.batchId).filter((id): id is string => Boolean(id)));
    return batches
      .filter((batch) => ids.has(batch.id) || batch.status === 'queued' || batch.status === 'processing')
      .map((batch) => {
        const members = jobs.filter((job) => job.batchId === batch.id);
        return { batch, ...recountOcrBatchFromJobs(members, batch.totalCount) };
      });
  }, [batches, jobs]);

  return (
    <div className="flex flex-col gap-6" dir="auto" data-pf-ocr-review>
      <Alert tone={initialStatus.featureMode === 'live' ? 'info' : 'warning'}>
        <p className="font-medium">{t(`configurationState.${initialStatus.featureMode}`)}</p>
        <p>{t(initialStatus.messageKey)}</p>
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
              multiple
              className="sr-only"
              aria-hidden="true"
              tabIndex={-1}
              data-pf-ocr-file-input
              disabled={pending}
              onChange={(event) => {
                onExtractImages(event.target.files ? [...event.target.files] : []);
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

      {visibleBatches.length > 0 ? (
        <ul className="flex flex-col gap-2" data-pf-ocr-batches>
          {visibleBatches.map(({ batch, completedCount, failedCount, totalCount, status }) => (
            <li key={batch.id}>
              <Alert tone={status === 'failed' ? 'warning' : 'info'} data-pf-ocr-batch-id={batch.id}>
                {t('batchProgress', {
                  completed: completedCount,
                  total: totalCount,
                  failed: failedCount,
                })}
              </Alert>
            </li>
          ))}
        </ul>
      ) : null}

      {jobs.length === 0 ? (
        <Alert tone="info">{t('empty')}</Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <Tabs
              value={inboxTab}
              onValueChange={(value) => selectInboxTab(value as OcrInboxTab)}
            >
              <TabsList aria-label={t('inboxAria')} data-pf-ocr-inbox-tabs>
                {OCR_INBOX_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    data-pf-ocr-inbox-tab={tab}
                    className="text-xs sm:text-sm"
                  >
                    {t(`inbox.${tab}`)}
                    <span className="ms-1 tabular-nums">({inboxCounts[tab]})</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {inboxJobs.length === 0 ? (
              <Alert tone="info">{t(`inboxEmpty.${inboxTab}`)}</Alert>
            ) : (
              <ul className="flex flex-col gap-2" aria-label={t(`inbox.${inboxTab}`)}>
                {inboxJobs.map((job) => (
                  <li key={job.id}>
                    <button
                      type="button"
                      aria-current={job.id === selectedId ? 'true' : undefined}
                      data-pf-ocr-job-id={job.id}
                      data-pf-ocr-job-document-id={job.sourceDocument.documentId ?? ''}
                      data-pf-ocr-job-status={job.status}
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
            )}
          </div>

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
                    onClick={() => {
                      setLinkedPreviewDocumentId(null);
                      setPreviewOpen(true);
                    }}
                  >
                    {t('viewOriginal')}
                  </Button>
                ) : null}
                {selected.status === 'failed' && sourceDocumentId ? (
                  <Button type="button" className="min-h-11" loading={pending} onClick={onRetry}>
                    {t('retry')}
                  </Button>
                ) : null}
                {selected.status === 'queued' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    loading={pending}
                    onClick={onCancelQueued}
                  >
                    {t('cancelJob')}
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-col gap-4">
              {duplicateHits.length > 0 ? (
                <Alert
                  tone="danger"
                  title={t('duplicateWarningTitle')}
                  data-pf-ocr-duplicate-warning
                >
                  <p>{t('duplicateWarning')}</p>
                  <ul className="mt-2 list-disc ps-5 text-sm">
                    {duplicateHits.map((hit, index) => {
                      const href = duplicateHitHref(hit);
                      return (
                        <li key={`${hit.kind}-${hit.expenseId ?? hit.vendorBillId ?? hit.documentId ?? index}`}>
                          <span>
                            {hit.kind === 'exact_file' ? t('duplicateExactFile') : t('duplicateProbable')}
                          </span>
                          {href ? (
                            <Link
                              href={href}
                              className={cn(textNavLinkClassName, 'ms-2 rounded-sm text-sm font-medium')}
                            >
                              {hit.expenseId
                                ? t('duplicateOpenExpense')
                                : t('duplicateOpenBill')}
                            </Link>
                            ) : hit.documentId ? (
                            <button
                              type="button"
                              className={cn(
                                textNavLinkClassName,
                                'ms-2 rounded-sm text-sm font-medium',
                              )}
                              onClick={() => {
                                setLinkedPreviewDocumentId(hit.documentId ?? null);
                                setPreviewOpen(true);
                              }}
                            >
                              {t('duplicateOpenDocument')}
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-3 text-sm">{t('duplicateOverrideHint')}</p>
                  <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={duplicateOverride}
                      disabled={reviewLocked || pending}
                      onCheckedChange={(checked) => setDuplicateOverride(checked === true)}
                      aria-label={t('duplicateOverride')}
                      data-pf-ocr-duplicate-override
                    />
                    {t('duplicateOverride')}
                  </label>
                </Alert>
              ) : null}

              {warnings.map((warning) => (
                <Alert key={warning.code} tone="warning">
                  {t(warning.messageKey)}
                </Alert>
              ))}

              {selected.rawMetadata?.vatRates && selected.rawMetadata.vatRates.length > 1 ? (
                <Alert tone="info">
                  {t('multiVatRates', {
                    rates: selected.rawMetadata.vatRates.map((rate) => `${rate}%`).join(', '),
                  })}
                </Alert>
              ) : null}

              {selected.candidates ? (
                <>
                  <section
                    className="flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
                    data-pf-ocr-suggestions
                  >
                    <div>
                      <p className="text-sm font-medium">{t('recommendationsTitle')}</p>
                      <p className="text-xs text-[var(--pf-text-secondary)]">{t('recommendationsHint')}</p>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <p className="text-sm font-medium">{t('vendorEntity')}</p>
                      {vendorMatches.length === 1 &&
                      (vendorMatches[0]?.strength === 'exact_identifier' ||
                        vendorMatches[0]?.strength === 'exact_name') ? (
                        <p className="text-sm text-[var(--pf-text-secondary)]">{t('vendorExact')}</p>
                      ) : vendorMatches.length > 1 ? (
                        <p className="text-sm text-[var(--pf-text-secondary)]">{t('vendorProbable')}</p>
                      ) : (
                        <p className="text-sm text-[var(--pf-text-secondary)]">{t('vendorNone')}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {vendorMatches.map((match) => (
                          <button
                            key={match.vendorId}
                            type="button"
                            data-pf-ocr-vendor-suggestion={match.vendorId}
                            disabled={reviewLocked || pending}
                            className={cn(
                              pressableClassName,
                              'min-h-11 rounded-md border px-3 py-2 text-start text-sm',
                              vendorId === match.vendorId
                                ? 'border-[var(--pf-border-strong)] bg-[var(--pf-bg-muted)]'
                                : 'border-[var(--pf-border-default)]',
                            )}
                            onClick={() =>
                              setVendorId((prev) => (prev === match.vendorId ? '' : match.vendorId))
                            }
                          >
                            {match.vendorName}
                          </button>
                        ))}
                      </div>
                      <Label htmlFor="ocr-vendor-entity">{t('vendorEntity')}</Label>
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

                    <div className="flex flex-col gap-1.5">
                      <p className="text-sm font-medium">{t('suggestionProject')}</p>
                      {suggestions.projects.length === 0 &&
                      suggestions.purchaseOrders.length === 0 &&
                      suggestions.subcontractAgreements.length === 0 ? (
                        <p className="text-sm text-[var(--pf-text-secondary)]">{t('suggestionNone')}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {suggestions.projects.map((row) => (
                          <button
                            key={row.projectId}
                            type="button"
                            data-pf-ocr-project-suggestion={row.projectId}
                            disabled={reviewLocked || pending}
                            className={cn(
                              pressableClassName,
                              'min-h-11 rounded-md border px-3 py-2 text-start text-sm',
                              rememberProjectId === row.projectId
                                ? 'border-[var(--pf-border-strong)] bg-[var(--pf-bg-muted)]'
                                : 'border-[var(--pf-border-default)]',
                            )}
                            onClick={() =>
                              setRememberProjectId((prev) =>
                                prev === row.projectId ? '' : row.projectId,
                              )
                            }
                          >
                            <span className="block">{row.projectName}</span>
                            <span className="block text-xs text-[var(--pf-text-secondary)]">
                              {t(`suggestionReason.${row.reason}`)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {suggestions.purchaseOrders.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-sm font-medium">{t('suggestionPurchaseOrder')}</p>
                        <div className="flex flex-wrap gap-2">
                          {suggestions.purchaseOrders.map((row) => (
                            <button
                              key={row.purchaseOrderId}
                              type="button"
                              data-pf-ocr-po-suggestion={row.purchaseOrderId}
                              disabled={reviewLocked || pending}
                              className={cn(
                                pressableClassName,
                                'min-h-11 rounded-md border px-3 py-2 text-start text-sm',
                                rememberPurchaseOrderId === row.purchaseOrderId
                                  ? 'border-[var(--pf-border-strong)] bg-[var(--pf-bg-muted)]'
                                  : 'border-[var(--pf-border-default)]',
                              )}
                              onClick={() => {
                                const next =
                                  rememberPurchaseOrderId === row.purchaseOrderId
                                    ? ''
                                    : row.purchaseOrderId;
                                setRememberPurchaseOrderId(next);
                                if (next && row.projectId) setRememberProjectId(row.projectId);
                              }}
                            >
                              <span className="block">{row.reference ?? row.purchaseOrderId.slice(0, 8)}</span>
                              <span className="block text-xs text-[var(--pf-text-secondary)]">
                                {t(`suggestionPoStrength.${row.strength}`)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {suggestions.subcontractAgreements.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-sm font-medium">{t('suggestionSubcontract')}</p>
                        <div className="flex flex-wrap gap-2">
                          {suggestions.subcontractAgreements.map((row) => (
                            <button
                              key={row.subcontractAgreementId}
                              type="button"
                              data-pf-ocr-agreement-suggestion={row.subcontractAgreementId}
                              disabled={reviewLocked || pending}
                              className={cn(
                                pressableClassName,
                                'min-h-11 rounded-md border px-3 py-2 text-start text-sm',
                                rememberSubcontractAgreementId === row.subcontractAgreementId
                                  ? 'border-[var(--pf-border-strong)] bg-[var(--pf-bg-muted)]'
                                  : 'border-[var(--pf-border-default)]',
                              )}
                              onClick={() => {
                                const next =
                                  rememberSubcontractAgreementId === row.subcontractAgreementId
                                    ? ''
                                    : row.subcontractAgreementId;
                                setRememberSubcontractAgreementId(next);
                                if (next) setRememberProjectId(row.projectId);
                              }}
                            >
                              <span className="block">
                                {row.subcontractNumber ?? row.title}
                              </span>
                              <span className="block text-xs text-[var(--pf-text-secondary)]">
                                {t(`suggestionAgreementStrength.${row.strength}`)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {selected.candidates.suggestions.projectLabel?.value ||
                    selected.candidates.suggestions.categoryLabel?.value ? (
                      <div className="flex flex-col gap-1 text-sm text-[var(--pf-text-secondary)]">
                        <p className="font-medium text-[var(--pf-text-primary)]">{t('suggestionsTitle')}</p>
                        <p className="text-xs">{t('suggestionsHint')}</p>
                        {selected.candidates.suggestions.projectLabel?.value ? (
                          <p>
                            {t('suggestionProject')}: {selected.candidates.suggestions.projectLabel.value}
                          </p>
                        ) : null}
                        {selected.candidates.suggestions.categoryLabel?.value ? (
                          <p>
                            {t('suggestionCategory')}: {selected.candidates.suggestions.categoryLabel.value}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </section>

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
              ) : selected.status === 'queued' ||
                selected.status === 'processing' ||
                selected.status === 'running' ? (
                <Alert tone="info" data-pf-ocr-job-inflight>
                  {t('stillProcessing')}
                </Alert>
              ) : (
                <Alert tone="warning" data-pf-ocr-job-failed={selected.status === 'failed' ? 'true' : undefined}>
                  {selected.errorMessage ?? t('noCandidates')}
                </Alert>
              )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {(linkedPreviewDocumentId || sourceDocumentId) && selected ? (
        <DocumentPreviewDialog
          key={linkedPreviewDocumentId ?? sourceDocumentId}
          open={previewOpen}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) setLinkedPreviewDocumentId(null);
          }}
          documentId={linkedPreviewDocumentId ?? sourceDocumentId!}
          filename={
            linkedPreviewDocumentId && linkedPreviewDocumentId !== sourceDocumentId
              ? t('sourceDocumentUnknown')
              : (selected.sourceDocument.filename ?? t('sourceDocumentUnknown'))
          }
          mimeType={
            linkedPreviewDocumentId && linkedPreviewDocumentId !== sourceDocumentId
              ? ''
              : (selected.sourceDocument.mimeType ?? '')
          }
        />
      ) : null}
    </div>
  );
}
