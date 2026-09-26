'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';

export function QuickCaptureVideoPreview({
  documentId,
  mimeType,
  className,
}: {
  readonly documentId: string;
  readonly mimeType?: string;
  readonly className?: string;
}) {
  const t = useTranslations('quickCapture.video');
  const src = `/api/org-storage/download/${documentId}?disposition=inline`;

  return (
    <div className={className}>
      <video
        controls
        playsInline
        preload="metadata"
        src={src}
        className="max-h-[min(60vh,28rem)] w-full rounded-md border border-[var(--pf-border-default)] bg-black"
        data-pf-video-mime={mimeType ?? ''}
      />
      <p className="mt-2 text-xs text-[var(--pf-text-muted)]">{t('inlineHint')}</p>
    </div>
  );
}

export function QuickCaptureVideoPreviewFallback({
  documentId,
}: {
  readonly documentId: string;
}) {
  const t = useTranslations('quickCapture.video');

  return (
    <Alert tone="info">
      {t('playbackFallback')}{' '}
      <a
        href={`/api/org-storage/download/${documentId}?disposition=inline`}
        className="font-medium underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('openVideo')}
      </a>
    </Alert>
  );
}
