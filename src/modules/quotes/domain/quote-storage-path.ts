import { sanitizeFilenameSegment } from '@/modules/reports';

/** Stable nested folder under org `quotes_root` for a product quote. */
export function quoteStorageFolderSegment(input: {
  readonly title: string;
  readonly quoteId: string;
}): string {
  const titlePart = sanitizeFilenameSegment(input.title.trim(), 60) || 'quote';
  const idPart = input.quoteId.slice(0, 8);
  return `${titlePart}-${idPart}`;
}
