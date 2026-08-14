/** Public API of the documents module. */
export {
  prepareDocumentUpload,
  listDocumentsForOrg,
  listEntityDocuments,
  isStorageConfigured,
} from './application/upload-document';
export {
  attachFilesToOwner,
  assertCanAttachCreatePhotos,
} from './application/attach-files-to-owner';
export type {
  AttachFilesToOwnerInput,
  AttachFilesToOwnerResult,
} from './application/attach-files-to-owner';
export {
  finalizeDocumentUpload,
  createDocumentDownloadUrl,
  softDeleteDocument,
  retryFailedDocumentCleanups,
  getDocumentById,
} from './application/manage-document';
export type { StorageCleanupRetryResult } from './application/manage-document';
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
  CREATE_PHOTO_FIELD,
  MAX_CREATE_PHOTOS,
  collectCreatePhotoFiles,
} from './domain/create-form-files';
export {
  STORAGE_CLEANUP_RETRY_ATTEMPTS,
  STORAGE_CLEANUP_STATUSES,
  STORAGE_CLEANUP_RETRY_STATUSES,
  STORAGE_ORPHAN_CHECKSUM_PREFIX,
  isStorageCleanupStatus,
  isStorageOrphanChecksum,
  needsStorageCleanupRetry,
  restoreChecksumIfOrphanEncoded,
  decodeStorageOrphanChecksum,
} from './domain/storage-cleanup';
export type { StorageCleanupStatus } from './domain/storage-cleanup';

export {
  prepareUploadSchema,
  finalizeUploadSchema,
  listEntityDocumentsSchema,
} from './validation/schemas';
export type { PrepareUploadInput, FinalizeUploadInput } from './validation/schemas';
