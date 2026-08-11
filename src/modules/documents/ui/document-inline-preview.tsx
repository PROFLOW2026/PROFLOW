'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { downloadDocumentAction } from '../application/document-actions';
import {
  isBrowserPreviewableImageMime,
  isBrowserPreviewablePdfMime,
} from '../domain/file-rules';

export function DocumentInlinePreview({
  documentId,
  filename,
  mimeType = '',
}: {
  documentId: string;
  filename: string;
  mimeType?: string;
}) {
  const t = useTranslations('documents.attachments');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const showImage = isBrowserPreviewableImageMime(mimeType);
  const showPdf = isBrowserPreviewablePdfMime(mimeType);

  useEffect(() => {
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setUrl(null);
    });
    void downloadDocumentAction({ documentId }).then((result) => {
      if (cancelled) return;
      if (result.error || !result.url) {
        setError(result.error ?? t('previewFailed'));
        setLoading(false);
        return;
      }
      setUrl(result.url);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [documentId, t]);

  return (
    <div
      data-pf-ocr-original
      className="overflow-hidden rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
    >
      <p className="truncate border-b border-[var(--pf-border-default)] px-3 py-2 text-xs text-[var(--pf-text-secondary)]">
        {filename}
      </p>
      <div className="flex min-h-40 items-center justify-center p-2">
        {loading ? <Spinner className="size-6" /> : null}
        {!loading && error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
        {!loading && url && showImage ? (
          // Signed URL only — expires; no permanent public path.
          // eslint-disable-next-line @next/next/no-img-element -- ephemeral signed URL
          <img
            src={url}
            alt={filename}
            className="max-h-80 w-auto max-w-full object-contain xl:max-h-[70vh]"
          />
        ) : null}
        {!loading && url && showPdf ? (
          <iframe
            title={filename}
            src={url}
            className="h-64 w-full xl:h-[70vh]"
          />
        ) : null}
        {!loading && url && !showImage && !showPdf ? (
          <Alert tone="info">{t('previewUnsupported')}</Alert>
        ) : null}
      </div>
    </div>
  );
}
