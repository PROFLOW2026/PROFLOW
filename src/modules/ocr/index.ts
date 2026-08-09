/** Public API of the OCR / document-intelligence module (doc 27 foundation). */

export type {
  OcrCandidateFieldKey,
  OcrFieldCandidate,
  OcrFieldSource,
  FieldProvenance,
  OcrNonCanonicalSuggestions,
  OcrSourceDocumentRef,
  OcrReviewOverrides,
  ReceiptExtractionCandidates,
  ExtractionJobStatus,
  ExtractionJob,
  OcrProviderStatus,
} from './domain/types';
export { OCR_CANDIDATE_FIELD_KEYS, EXTRACTION_JOB_STATUSES } from './domain/types';

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
} from './domain/confirm';

export {
  applyFieldOverrides,
  validateMappedCandidates,
  mapCandidatesToExpenseInput,
  assertCandidatesPresent,
  emptyCandidates,
  buildFixtureCandidates,
  joinLineDescriptions,
} from './domain/field-mapping';
export type { FieldMappingIssue, CandidateFieldOverrides } from './domain/field-mapping';

export {
  StubOcrProvider,
  ScriptedOcrProvider,
  createDefaultOcrProvider,
  getOcrProvider,
  setOcrProviderForTests,
} from './domain/stub-provider';

export {
  resetOcrStoreForTests,
  seedFixtureJob,
  findJob,
  listJobsForOrg,
} from './data/in-memory-ocr.store';

export { getOcrProviderStatus } from './application/provider-status';
export { extractReceiptJob } from './application/extract-receipt';
export { listOcrCandidates } from './application/list-candidates';
export { confirmOcrCandidate } from './application/confirm-candidate';
export type {
  ConfirmOcrCandidateResult,
  CreateExpenseFn,
} from './application/confirm-candidate';

export {
  extractReceiptSchema,
  listOcrCandidatesSchema,
  confirmOcrCandidateSchema,
} from './validation/schemas';
export type {
  ExtractReceiptAppInput,
  ListOcrCandidatesInput,
  ConfirmOcrCandidateInput,
} from './validation/schemas';
