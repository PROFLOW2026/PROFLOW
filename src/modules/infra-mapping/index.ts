/**
 * Infrastructure mapping ("מיפוי תשתיות") - public API (client-safe: pure domain only).
 *
 * Server-only pieces live in `./server` (production wiring), `./actions` (server actions),
 * `./routes` (upload endpoints) and `./application/*` (use-cases, injectable ports).
 * UI lives in `./ui` and is exported from `./ui.ts`.
 */
export * from './domain/types';
export * from './domain/filters';
export * from './domain/folder-naming';
export * from './domain/markings';
export * from './domain/alignment-record';
export * from './domain/upload-queue';
export * from './domain/messages';
export {
  beginCaptureSchema,
  beginComparisonSchema,
  captureDetailsSchema,
  folderLinkSchema,
  folderSyncSchema,
  listCapturesSchema,
  saveMarkingsSchema,
  updateCaptureSchema,
} from './domain/validation';
