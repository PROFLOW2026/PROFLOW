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

type PreviewFetch = {
  documentId: string;
  url: string | null;
  error: string | null;
};

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
  const [fetched, setFetched] = useState<PreviewFetch | null>(null);

  const showImage = isBrowserPreviewableImageMime(mimeType);
  const showPdf = isBrowserPreviewablePdfMime(mimeType);
  const url = fetched?.documentId === documentId ? fetched.url : null;
  const error = fetched?.documentId === documentId ? fetched.error : null;
  const loading = !url && !error;

  useEffect(() => {
    let cancelled = false;
    const requestedId = documentId;

    void downloadDocumentAction({ documentId: requestedId }).then((result) => {
      if (cancelled) return;
      if (result.error || !result.url) {
        setFetched({
          documentId: requestedId,
          url: null,
          error: result.error ?? t('previewFailed'),
        });
        return;
      }
      setFetched({ documentId: requestedId, url: result.url, error: null });
    });

    return () => {
      cancelled = true;
    };
    // Intentionally omit `t`: next-intl's translator identity changes on parent
    // re-renders and was causing a signed-URL reload loop in production.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- documentId only
  }, [documentId]);

  return (
    <div
      data-pf-ocr-original
      data-pf-preview-document-id={documentId}
      className="overflow-hidden rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
    >
      <p
        dir="ltr"
        className="truncate border-b border-[var(--pf-border-default)] px-3 py-2 text-xs text-[var(--pf-text-secondary)]"
        style={{ unicodeBidi: 'isolate' }}
      >
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
          // Signed URL only - expires; no permanent public path.
          // eslint-disable-next-line @next/next/no-img-element -- ephemeral signed URL
          <img
            key={`${documentId}:${url}`}
            src={url}
            alt={filename}
            className="max-h-80 w-auto max-w-full object-contain xl:max-h-[70vh]"
            onError={() =>
              setFetched({ documentId, url: null, error: t('previewFailed') })
            }
          />
        ) : null}
        {!loading && url && showPdf ? (
          <iframe
            key={`${documentId}:${url}`}
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
