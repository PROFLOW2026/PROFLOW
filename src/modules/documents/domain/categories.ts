/**
 * Closed document category labels stored on `document_links.label` when chosen
 * from the product UI. Free-text labels remain allowed for ad-hoc notes.
 * Avoids a new schema column until Lead assigns a dedicated metadata migration.
 */

export const DOCUMENT_CATEGORIES = [
  'contract',
  'invoice',
  'receipt',
  'quote',
  'insurance',
  'license',
  'certificate',
  'photo',
  'drawing',
  'other',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}
