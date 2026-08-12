/** Public API of the documents module. */
export {
  prepareDocumentUpload,
  listDocumentsForOrg,
  listEntityDocuments,
  isStorageConfigured,
} from './application/upload-document';
export {
  finalizeDocumentUpload,
  createDocumentDownloadUrl,
  softDeleteDocument,
  getDocumentById,
} from './application/manage-document';
export { linkDocumentToEntity, unlinkDocumentFromEntity } from './application/link-document';
export {
  getEntityDocumentPanelData,
} from './application/entity-document-panel';
export type {
  EntityDocumentPanelData,
} from './application/entity-document-panel';

export {
  DOCUMENT_STATUSES,
  DOCUMENT_OWNER_TYPES,
} from './domain/types';
export type {
  DocumentStatus,
  DocumentOwnerType,
  DocumentRecord,
  DocumentListItem,
  DocumentLinkCandidate,
  DocumentLinkRecord,
  PrepareUploadResult,
  DownloadUrlResult,
} from './domain/types';

export {
  validateUploadConstraints,
  isAllowedMimeType,
  isAllowedFileSize,
  isBrowserPreviewableImageMime,
  isBrowserPreviewablePdfMime,
  isBrowserPreviewableMime,
  normalizeUploadMime,
  storageObjectExtension,
  MAX_DOCUMENT_SIZE_BYTES,
} from './domain/file-rules';
export type { NormalizeUploadMimeResult } from './domain/file-rules';
export type { DocumentRuntimeStage } from './domain/runtime-stage';
export { DOCUMENT_RUNTIME_STAGES } from './domain/runtime-stage';

export { DOCUMENT_CATEGORIES, isDocumentCategory } from './domain/categories';
export type { DocumentCategory } from './domain/categories';

export { formatFileSize } from './domain/format-file-size';

export {
  prepareUploadSchema,
  finalizeUploadSchema,
  listEntityDocumentsSchema,
} from './validation/schemas';
export type { PrepareUploadInput, FinalizeUploadInput } from './validation/schemas';
