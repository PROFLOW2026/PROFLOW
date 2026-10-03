/**
 * Evidence / attachments (Track IJ) - public API. Signatures of `listEvidence`, `countEvidence` and
 * the item types are frozen (MAIN AGENT contract); additions are optional only.
 *
 * Photos, videos and documents attached to any Developer/GC entity (task completion, claim line,
 * defect, inspection, RFI, submittal, coordination response, daily log, delivery, safety record,
 * handover item...). Bytes go to the org's configured external storage via the existing
 * `documents` + `document_links` + external-storage architecture; one file is never copied per
 * contractor - visibility is metadata.
 *
 * Upload flows are server actions in `@/modules/evidence/actions`:
 *   - internal: `uploadEvidenceAction` (OrgContext + project capability on the owning entity)
 *   - external: `uploadExternalEvidenceAction` (ExternalContext + grant covering the entity scope)
 * Both resolve the owning entity through `@/shared/entity-access` (`resolveEntityScope`), return an
 * upload ticket, and the browser POSTs the bytes to the ticket's same-origin URL.
 *
 * UI: `@/modules/evidence/ui` exports `<EvidenceGallery>` and `<EvidenceUploader>`.
 */

export type {
  EvidenceAudience,
  EvidenceItem,
  EvidenceKind,
  EvidenceUploadTicket,
  EvidenceVisibility,
  ListEvidenceInput,
} from './domain/types';
export {
  EVIDENCE_ALLOWED_MIME_TYPES,
  EVIDENCE_SIZE_LIMITS,
  checkEvidenceFile,
  contentMatchesMime,
  evidenceAcceptAttribute,
  evidenceKindForMime,
  sanitizeEvidenceFileName,
} from './domain/file-policy';
export { normalizeCaption, resolveEvidenceVisibility } from './domain/visibility';
export {
  countEvidence,
  listEvidence,
  loadExternalEvidenceGallery,
  loadInternalEvidenceGallery,
  openExternalEvidenceFile,
  openInternalEvidenceFile,
  type EvidenceFileDownload,
  type EvidenceGalleryData,
} from './application/list-evidence';
export {
  EXTERNAL_EVIDENCE_UPLOAD_PATH,
  INTERNAL_EVIDENCE_UPLOAD_PATH,
  beginExternalEvidenceUpload,
  beginInternalEvidenceUpload,
  completeExternalEvidenceUpload,
  completeInternalEvidenceUpload,
  removeExternalEvidence,
  removeInternalEvidence,
  type BeginEvidenceUploadInput,
  type BeginExternalEvidenceUploadInput,
  type CompleteEvidenceUploadInput,
} from './application/upload-evidence';
export {
  authorizeExternalEntity,
  authorizeInternalEntity,
  pickExternalGrant,
  type ExternalEntityAccess,
  type ProjectEntityScope,
} from './application/access';
export type {
  ElevatedRunner,
  OpenedFile,
  ProjectFileDeps,
  ProjectFileFolder,
  ProjectFileStore,
  StorageConnectionRef,
  StoredFile,
} from './application/file-store';
export {
  createPendingProjectDocument,
  markProjectDocumentStored,
  readDocumentSummary,
  type ProjectDocumentSummary,
} from './application/document-records';
