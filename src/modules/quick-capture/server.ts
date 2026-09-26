import 'server-only';

export {
  submitCapture,
  markCaptureUploadFailed,
  assertCaptureAwaitingUpload,
} from './application/submit-capture';
export type { SubmitCaptureInput } from './application/submit-capture';

export { finalizeCaptureUpload } from './application/finalize-capture-upload';
export type { FinalizeCaptureUploadInput } from './application/finalize-capture-upload';

export { processCapture } from './application/process-capture';
export { assertCaptureSessionDocument } from './application/assert-capture-session-document';
export { startFinancialOcr } from './application/start-financial-ocr';
export type { StartFinancialOcrInput } from './application/start-financial-ocr';

export {
  approveCapture,
  approveFieldMediaCapture,
  approveFinancialCapture,
  approveOtherDocumentCapture,
} from './application/approve-capture';
export type {
  ApproveFieldMediaInput,
  ApproveFinancialInput,
  ApproveOtherDocumentInput,
} from './application/approve-capture';

export { rejectCapture } from './application/reject-capture';
export type { RejectCaptureInput } from './application/reject-capture';

export { listCaptureInbox, INBOX_CAPTURE_STATUSES } from './application/list-inbox';
export type { CaptureInboxItem } from './application/list-inbox';

export { pollCaptureOcr } from './application/poll-capture-ocr';
export type { CaptureOcrPollResult } from './application/poll-capture-ocr';

export { notifyCaptureReview } from './application/notify-capture-review';
export { loadCaptureReview } from './application/load-capture-review';
export type { CaptureReviewData } from './application/load-capture-review';

export {
  getQuickCaptureFormDataAction,
  submitQuickCaptureAction,
  finalizeQuickCaptureUploadAction,
  markQuickCaptureUploadFailedAction,
  listQuickCaptureInboxAction,
  getQuickCaptureReviewAction,
  startCaptureFinancialOcrAction,
  pollCaptureOcrAction,
  approveQuickCaptureAction,
  rejectQuickCaptureAction,
} from './application/quick-capture-actions';
export type { QuickCaptureActionResult } from './application/quick-capture-actions';

export {
  findCaptureById,
  findCaptureByIdempotencyKey,
  insertCaptureItem,
  updateCaptureItem,
  listCapturesForOrg,
  countCapturesForOrg,
} from './data/quick-capture.repository';

export {
  insertCaptureDocument,
  listCaptureDocumentsByCaptureId,
  findCaptureDocumentMembership,
  updateCaptureDocument,
  deleteCaptureDocumentsForCapture,
} from './data/capture-documents.repository';

export type {
  CaptureItemRecord,
  CaptureDocumentRecord,
  CaptureStatus,
  SessionKind,
  DetectedType,
} from './domain/types';
