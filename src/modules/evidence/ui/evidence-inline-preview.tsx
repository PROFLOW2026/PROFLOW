'use client';

import { useState } from 'react';

/** Lightweight inline preview for images/PDFs before download (DOC-001). */
export function EvidenceInlinePreview({
  href,
  fileName,
  kind,
}: {
  readonly href: string;
  readonly fileName: string;
  readonly kind: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPhoto = kind === 'photo' || /\.(png|jpe?g|webp|gif)$/i.test(fileName);

  if (!expanded) {
    return (
      <button
        type="button"
        className="text-xs font-medium text-[var(--pf-text-brand)] hover:underline"
        onClick={() => setExpanded(true)}
      >
        Preview
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {isPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={href} alt={fileName} className="max-h-48 w-full rounded object-contain" />
      ) : (
        <iframe
          title={fileName}
          src={href}
          className="h-48 w-full rounded border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)]"
        />
      )}
      <button
        type="button"
        className="text-xs text-[var(--pf-text-secondary)] hover:underline"
        onClick={() => setExpanded(false)}
      >
        Hide preview
      </button>
    </div>
  );
}
