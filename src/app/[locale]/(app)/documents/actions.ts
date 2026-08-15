'use server';

export {
  prepareDocumentUploadAction,
  finalizeDocumentUploadAction,
  downloadDocumentAction,
  linkDocumentAction,
  unlinkDocumentAction,
  softDeleteDocumentAction,
  listDocumentFoldersAction,
  createDocumentFolderAction,
  listDocumentVersionsAction,
  prepareNewVersionUploadAction,
  finalizeNewVersionUploadAction,
  downloadDocumentVersionAction,
  setDocumentMetadataAction,
} from '@/modules/documents/application/document-actions';

export type {
  ActionResult,
  PrepareUploadActionResult,
  DownloadActionResult,
} from '@/modules/documents/application/document-actions';
