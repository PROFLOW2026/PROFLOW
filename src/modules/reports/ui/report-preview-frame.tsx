'use client';

import { REPORT_PREVIEW_FRAME_ID } from './report-print-button';

/** Isolated document frame. Printing uses this frame so the app shell stays out of the page. */
export function ReportPreviewFrame({
  title,
  html,
  frameId = REPORT_PREVIEW_FRAME_ID,
}: {
  title: string;
  html: string;
  frameId?: string;
}) {
  return (
    <iframe
      id={frameId}
      title={title}
      srcDoc={html}
      onLoad={(event) => {
        const frame = event.currentTarget;
        const height = frame.contentDocument?.documentElement.scrollHeight;
        if (height && height > 0) frame.style.height = `${height}px`;
      }}
      className="block h-auto w-full min-w-0 max-w-full rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
      sandbox="allow-same-origin allow-modals"
    />
  );
}
