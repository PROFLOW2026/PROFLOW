/** Public API of the OCR / document-intelligence module (doc 27 foundation). */

export type {
  OcrCandidateFieldKey,
  OcrFieldCandidate,
  OcrFieldSource,
  FieldProvenance,
  OcrNonCanonicalSuggestions,
  OcrSourceDocumentRef,
  OcrReviewOverrides,
  OcrSafeRawMetadata,
  ReceiptExtractionCandidates,
  ExtractionJobStatus,
  ExtractionJob,
  OcrBatch,
  OcrBatchStatus,
  OcrProviderStatus,
  OcrReviewStatus,
  OcrDraftTarget,
} from './domain/types';
export {
  OCR_CANDIDATE_FIELD_KEYS,
  EXTRACTION_JOB_STATUSES,
  OCR_REVIEW_STATUSES,
  OCR_DRAFT_TARGETS,
  OCR_BATCH_STATUSES,
} from './domain/types';

export type {
  OcrProvider,
  ExtractReceiptInput,
  ExtractReceiptResult,
  ExtractReceiptErrorCode,
} from './domain/provider';

export type { ConfirmedReceiptFields, ConfirmReceiptExtractionInput } from './domain/confirm';
export {
  assertOcrIsNotCanonicalLedgerTruth,
  confirmReceiptExtraction,
  mapConfirmedFieldsToExpenseDraft,
  mapConfirmedFieldsToVendorBillDraft,
  mapStructuredBillLines,
} from './domain/confirm';
export { canonicalToCandidates, suggestedDraftTarget } from './domain/canonical';
export type { CanonicalOcrDocument } from './domain/canonical';
export { mapAzureAnalyzeResult } from './domain/azure-mapper';
export { matchVendors } from './domain/vendor-matching';
export { detectDuplicateHits, shouldReuseExistingJob } from './domain/duplicates';
export { collectReviewWarnings, lineItemsTrustworthy, countTrustworthyLineRows } from './domain/totals-warnings';
export { confidenceState } from './domain/confidence';
export {
  suggestDocumentTypeFromText,
  normalizeIsraeliIdentifier,
  extractIsraeliCompanyNumber,
  extractIsraeliInvoiceNumber,
  extractIsraeliSupplierCompanyNumber,
  extractIsraeliCustomerCompanyNumber,
} from './domain/israeli-normalize';
export { resolveAzureModelId, AZURE_INVOICE_MODEL, AZURE_RECEIPT_MODEL } from './domain/model-strategy';
export { isOcrSupportedMime, assertOcrFileLimits, resolveActiveOcrCapabilities } from './domain/cost-controls';
export {
  resolveAzureCapabilities,
  readAzurePricingTier,
  isAzureQueryFieldsEnabled,
} from './domain/provider-capabilities';
export type { OcrProviderCapabilities, AzurePricingTier } from './domain/provider-capabilities';

export {
  applyFieldOverrides,
  validateMappedCandidates,
  mapCandidatesToExpenseInput,
  assertCandidatesPresent,
  emptyCandidates,
  buildFixtureCandidates,
  joinLineDescriptions,
  hydrateCandidates,
} from './domain/field-mapping';
export type { FieldMappingIssue, CandidateFieldOverrides } from './domain/field-mapping';

export {
  StubOcrProvider,
  ScriptedOcrProvider,
} from './domain/stub-provider';
export { AzureDocumentIntelligenceProvider } from './domain/azure-provider';
export { UnimplementedOcrProvider } from './domain/unimplemented-provider';
export {
  createDefaultOcrProvider,
  createOcrProviderFromEnv,
  getOcrProvider,
  setOcrProviderForTests,
} from './domain/provider-registry';

export {
  AZURE_OCR_LIVE_HTTP_READY,
  getOcrFeatureMode,
  isOcrIngestionEnabled,
  isOcrIngestionFlagOn,
  isOcrFixtureAllowed,
  isOcrReviewUiAllowed,
  isLiveOcrProviderConfigured,
  isOcrProviderCredentialsPresent,
} from './domain/feature-gate';
export type { OcrFeatureMode } from './domain/feature-gate';

export {
  OCR_PERSISTENCE_READY,
  areOcrJobsDurable,
  setOcrPersistenceReadyForTests,
} from './domain/persistence';

export {
  assertOcrConfirmedTargetShape,
  expenseConfirmTargetShape,
  vendorBillConfirmTargetShape,
  vendorCreditConfirmTargetShape,
  OCR_TARGET_SHAPE_MESSAGE,
} from './domain/target-shape';

export {
  isOcrActiveProcessingStatus,
  isOcrTerminalJobStatus,
  isOcrCancelableStatus,
  mapProviderSuccessToJobStatus,
  recountOcrBatchFromJobs,
  OCR_ACTIVE_PROCESSING_STATUSES,
  OCR_WORKER_MAX_ATTEMPTS,
} from './domain/job-lifecycle';

export {
  resetOcrStoreForTests,
  seedFixtureJob,
  findJob,
  listJobsForOrg,
  updateJob,
  createQueuedJob,
  createBatch,
  createInMemoryOcrRepository,
} from './data/in-memory-ocr.store';
export type { OcrRepository } from './data/ocr.repository';
export { createDrizzleOcrRepository } from './data/drizzle-ocr.repository';
export { getOcrRepository, setOcrRepositoryForTests } from './data/resolve-repository';

export {
  getOcrProviderStatus,
  readOcrProviderStatus,
  azureOcrNeedsKeyAndEndpoint,
} from './application/provider-status';
export { getOcrQueueSnapshot } from './application/queue-counts';
export type { OcrQueueCounts, OcrQueueSnapshot } from './application/queue-counts';
export { extractReceiptJob } from './application/extract-receipt';
export {
  processQueuedJob,
  cancelQueuedOcrJob,
  flushOcrBackgroundJobs,
  setOcrBackgroundProcessingForTests,
  resetOcrBackgroundJobsForTests,
  registerOcrJobForWorker,
} from './application/process-job';
export { drainDurableOcrQueue } from './application/drain-queue';
export { cancelOcrJob } from './application/cancel-job';
export { createOcrBatch, getOcrBatchProgress, listOcrBatches } from './application/batches';
export {
  OCR_REVIEW_SURFACE_STATUSES,
  OCR_REVIEW_HISTORY_STATUSES,
  isOcrActiveQueueStatus,
  isOcrHistoryStatus,
} from './domain/review-queue';
export { listOcrCandidates } from './application/list-candidates';
export { confirmOcrCandidate } from './application/confirm-candidate';
export type {
  ConfirmOcrCandidateResult,
  CreateExpenseFn,
} from './application/confirm-candidate';
export { rejectOcrCandidate } from './application/reject-candidate';
export {
  createVendorBillDraftFromOcr,
} from './application/create-vendor-bill-draft';
export { createVendorCreditDraftFromOcr } from './application/create-vendor-credit-draft';
export type {
  CreateVendorBillDraftFn,
  VendorBillDraftPayload,
} from './application/create-vendor-bill-draft';

export {
  extractReceiptSchema,
  listOcrCandidatesSchema,
  confirmOcrCandidateSchema,
  rejectOcrCandidateSchema,
  createOcrBatchSchema,
  cancelOcrJobSchema,
} from './validation/schemas';
export type {
  ExtractReceiptAppInput,
  ListOcrCandidatesInput,
  ConfirmOcrCandidateInput,
  RejectOcrCandidateInput,
  CreateOcrBatchAppInput,
  CancelOcrJobInput,
} from './validation/schemas';
