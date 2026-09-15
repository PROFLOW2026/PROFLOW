import { describe, expect, it } from 'vitest';
import {
  PDFJS_WORKER_PUBLIC_PATH,
  REACT_PDF_SUSPENSE_ENABLED,
} from '@/modules/external-storage/ui/pdf-viewer-config';

describe('pdf viewer config', () => {
  it('uses same-origin worker path', () => {
    expect(PDFJS_WORKER_PUBLIC_PATH).toBe('/pdf.worker.min.mjs');
  });

  it('disables react-pdf Suspense to avoid React #419 without boundaries', () => {
    expect(REACT_PDF_SUSPENSE_ENABLED).toBe(false);
  });
});
