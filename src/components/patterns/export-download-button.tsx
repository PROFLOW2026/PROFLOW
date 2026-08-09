'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  ExportDownloadToast,
  useExportDownload,
  type ExportDownloadFeedback,
} from '@/modules/exports/ui/export-download-control';
import { cn } from '@/shared/ui/cn';

export type { ExportDownloadFeedback };
export { useExportDownload };

export interface ExportDownloadButtonProps {
  /** Path to the export route, e.g. `/exports/projects` (locale prefix added). */
  readonly href: string;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly variant?: React.ComponentProps<typeof Button>['variant'];
  readonly size?: React.ComponentProps<typeof Button>['size'];
  /** Shared feedback when coordinating multiple export triggers. */
  readonly feedback?: ExportDownloadFeedback;
}

/**
 * Button-styled export trigger backed by export-download-control + StatusToast.
 */
export function ExportDownloadButton({
  href,
  children,
  className,
  variant = 'ghost',
  size = 'sm',
  feedback: external,
}: ExportDownloadButtonProps) {
  const t = useTranslations('exports.feedback');
  const internal = useExportDownload();
  const feedback = external ?? internal;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn(className)}
        disabled={feedback.busy}
        loading={feedback.busy}
        aria-busy={feedback.busy || undefined}
        onClick={() => {
          void feedback.run(href);
        }}
      >
        {feedback.busy && !external ? t('preparing') : children}
      </Button>
      {external ? null : <ExportDownloadToast feedback={feedback} />}
    </>
  );
}
