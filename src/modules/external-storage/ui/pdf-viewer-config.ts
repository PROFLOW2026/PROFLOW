/** Same-origin PDF.js worker served from /public (copied in prebuild/predev). */
export const PDFJS_WORKER_PUBLIC_PATH = '/pdf.worker.min.mjs';

/** react-pdf v11 defaults to Suspense; must opt out unless wrapped in Suspense boundaries. */
export const REACT_PDF_SUSPENSE_ENABLED = false;
