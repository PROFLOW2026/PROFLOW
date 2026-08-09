/**
 * UI entry point for this module.
 *
 * Kept separate from `index.ts` so importing the module's application or domain
 * layer never pulls React server components — and the `server-only` guard they
 * import — into plain Node contexts such as unit tests.
 */

export { DocumentAttachments } from './ui/document-attachments';
export type { DocumentAttachmentsProps } from './ui/document-attachments';
export { DocumentPreviewDialog } from './ui/document-preview-dialog';
export type { DocumentPreviewDialogProps } from './ui/document-preview-dialog';
