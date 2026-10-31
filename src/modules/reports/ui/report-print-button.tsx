'use client';

import { Button } from '@/components/ui/button';

export const REPORT_PREVIEW_FRAME_ID = 'pf-report-preview-frame';

/** Print the branded document, not the application shell around the preview frame. */
export function printReportPreview(frameId: string = REPORT_PREVIEW_FRAME_ID): void {
  const frame = document.getElementById(frameId);
  const target = frame instanceof HTMLIFrameElement ? frame.contentWindow : null;
  if (target) {
    target.focus();
    target.print();
    return;
  }
  window.print();
}

export function ReportPrintButton({
  label,
  frameId,
}: {
  label: string;
  frameId?: string;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="print:hidden"
      onClick={() => printReportPreview(frameId ?? REPORT_PREVIEW_FRAME_ID)}
    >
      {label}
    </Button>
  );
}
