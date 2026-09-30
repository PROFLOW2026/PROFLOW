import { renderReportHtmlDocument } from '../application/render-html';
import type { ReportPayload } from '../domain/types';

/** Customer-facing branded preview (shared HTML renderer with print/storage). */
export function ReportBrandedPreview({ payload }: { payload: ReportPayload }) {
  const html = renderReportHtmlDocument(payload);
  return (
    <iframe
      title={payload.title}
      srcDoc={html}
      className="min-h-[75vh] w-full rounded-lg border border-[var(--pf-border-default)] bg-white print:min-h-0 print:border-0"
      sandbox="allow-same-origin"
    />
  );
}
