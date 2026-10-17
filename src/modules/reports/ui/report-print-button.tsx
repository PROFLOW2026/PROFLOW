'use client';

import { Button } from '@/components/ui/button';

export const REPORT_PREVIEW_FRAME_ID = 'pf-report-preview-frame';

/** Print the branded document, not the application shell around the preview frame. */
export function printReportPreview(): void {
  const frame = document.getElementById(REPORT_PREVIEW_FRAME_ID);
  const target = frame instanceof HTMLIFrameElement ? frame.contentWindow : null;
  if (target) {
    target.focus();
    target.print();
    return;
  }
  window.print();
}

export function ReportPrintButton({ label }: { label: string }) {
  return (
    <Button type="button" variant="secondary" size="sm" className="print:hidden" onClick={printReportPreview}>
      {label}
    </Button>
  );
}
