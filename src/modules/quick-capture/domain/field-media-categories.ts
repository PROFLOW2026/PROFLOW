/**
 * Closed field-media category labels stored on document_links.label.
 * Field-media-neutral — applies to site photos and field video alike.
 */

export const FIELD_MEDIA_CATEGORIES = [
  'progress',
  'before',
  'after',
  'defect',
  'installation',
  'documentation',
] as const;

export type FieldMediaCategory = (typeof FIELD_MEDIA_CATEGORIES)[number];

export function isFieldMediaCategory(value: string | null | undefined): value is FieldMediaCategory {
  return (FIELD_MEDIA_CATEGORIES as readonly string[]).includes(value ?? '');
}

export function assertFieldMediaCategory(value: string): FieldMediaCategory {
  if (!isFieldMediaCategory(value)) {
    throw new Error(`Invalid field media category: ${value}`);
  }
  return value;
}
