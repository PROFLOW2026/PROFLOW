/**
 * Safe diagnostic stages for document/OCR upload + preview.
 * Never include tokens, signed URLs, or credentials.
 */
export const DOCUMENT_RUNTIME_STAGES = [
  'file_picker',
  'prepare',
  'signed_target',
  'storage_upload',
  'finalize',
  'storage_verify',
  'storage_download',
  'ocr_job_create',
  'azure_analyze',
  'azure_poll',
  'preview_download',
  'preview_render',
] as const;

export type DocumentRuntimeStage = (typeof DOCUMENT_RUNTIME_STAGES)[number];
