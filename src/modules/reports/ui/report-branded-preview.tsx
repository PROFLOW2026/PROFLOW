import { renderReportHtmlDocument } from '../application/render-html';
import type { ReportPayload } from '../domain/types';
import { ReportPreviewFrame } from './report-preview-frame';

/** Customer-facing branded preview (shared HTML renderer with print/storage). */
export function ReportBrandedPreview({
  payload,
  frameId,
}: {
  payload: ReportPayload;
  frameId?: string;
}) {
  return (
    <div className="min-w-0 max-w-full">
      <ReportPreviewFrame
        frameId={frameId}
        title={payload.title}
        html={renderReportHtmlDocument(payload)}
      />
    </div>
  );
}
