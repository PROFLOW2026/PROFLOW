import { renderReportHtmlDocument } from '../application/render-html';
import type { ReportPayload } from '../domain/types';
import { ReportPreviewFrame } from './report-preview-frame';

/** Customer-facing branded preview (shared HTML renderer with print/storage). */
export function ReportBrandedPreview({ payload }: { payload: ReportPayload }) {
  return <ReportPreviewFrame title={payload.title} html={renderReportHtmlDocument(payload)} />;
}
