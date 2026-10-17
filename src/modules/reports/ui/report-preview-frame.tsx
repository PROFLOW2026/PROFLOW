'use client';

import { REPORT_PREVIEW_FRAME_ID } from './report-print-button';

/** Isolated document frame. Printing uses this frame so the app shell stays out of the page. */
export function ReportPreviewFrame({ title, html }: { title: string; html: string }) {
  return (
    <iframe
      id={REPORT_PREVIEW_FRAME_ID}
      title={title}
      srcDoc={html}
      onLoad={(event) => {
        const frame = event.currentTarget;
        const height = frame.contentDocument?.documentElement.scrollHeight;
        if (height && height > 0) frame.style.height = `${height}px`;
      }}
      className="block w-full min-w-0 max-w-full rounded-lg border border-[var(--pf-border-default)] bg-white"
      sandbox="allow-same-origin allow-modals"
    />
  );
}
