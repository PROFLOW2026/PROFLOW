'use client';

import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/spinner';
import type { OcrReviewPanelProps } from './ocr-review-panel';

const OcrReviewPanel = dynamic(
  () => import('./ocr-review-panel').then((mod) => mod.OcrReviewPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-48 items-center justify-center rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-10">
        <Spinner />
      </div>
    ),
  },
);

/** Dev/tooling route island — defer the review UI until this page mounts. */
export function OcrReviewPanelLazy(props: OcrReviewPanelProps) {
  return <OcrReviewPanel {...props} />;
}
