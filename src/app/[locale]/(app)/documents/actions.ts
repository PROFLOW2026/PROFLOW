'use server';

export {
  prepareDocumentUploadAction,
  finalizeDocumentUploadAction,
  downloadDocumentAction,
} from '@/modules/documents/application/document-actions';

export type {
  ActionResult,
  PrepareUploadActionResult,
  DownloadActionResult,
} from '@/modules/documents/application/document-actions';
