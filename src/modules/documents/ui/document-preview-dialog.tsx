'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import {
  isBrowserPreviewableImageMime,
  isBrowserPreviewablePdfMime,
} from '../domain/file-rules';
import { downloadDocumentAction } from '../application/document-actions';

export interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  filename: string;
  mimeType?: string;
}

/**
 * Loads a short-lived signed download URL for inline image/PDF preview.
 * Never stores or exposes a permanent public object URL.
 */
export function DocumentPreviewDialog({
  open,
  onOpenChange,
  documentId,
  filename,
  mimeType = '',
}: DocumentPreviewDialogProps) {
  const t = useTranslations('documents.attachments');
  const tCommon = useTranslations('common');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const showImage = isBrowserPreviewableImageMime(mimeType);
  const showPdf = isBrowserPreviewablePdfMime(mimeType);

  useEffect(() => {
    if (!open) return;

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
  }, [open, documentId, t]);

  const activeUrl = open ? url : null;
  const activeError = open ? error : null;
  const activeLoading = open ? loading : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon('actions.close')} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('preview')}</DialogTitle>
          <DialogDescription>{filename}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex min-h-48 items-center justify-center">
          {activeLoading ? <Spinner className="size-6" /> : null}
          {!activeLoading && activeError ? (
            <Alert tone="danger" role="alert">
              {activeError}
            </Alert>
          ) : null}
          {!activeLoading && activeUrl && showImage ? (
            // Signed URL only — expires; no permanent public path.
            // eslint-disable-next-line @next/next/no-img-element -- ephemeral signed URL
            <img
              src={activeUrl}
              alt={filename}
              className="max-h-[70vh] w-auto max-w-full rounded-md object-contain"
              onError={() => setError(t('previewFailed'))}
            />
          ) : null}
          {!activeLoading && activeUrl && showPdf ? (
            <iframe
              title={filename}
              src={activeUrl}
              className="h-[70vh] w-full rounded-md border border-[var(--pf-border-default)]"
            />
          ) : null}
          {!activeLoading && activeUrl && !showImage && !showPdf ? (
            <Alert tone="info">{t('previewUnsupported')}</Alert>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {tCommon('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

