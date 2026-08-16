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

type PreviewFetch = {
  documentId: string;
  url: string | null;
  error: string | null;
};

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
  const [fetched, setFetched] = useState<PreviewFetch | null>(null);

  const showImage = isBrowserPreviewableImageMime(mimeType);
  const showPdf = isBrowserPreviewablePdfMime(mimeType);
  const url = fetched?.documentId === documentId ? fetched.url : null;
  const error = fetched?.documentId === documentId ? fetched.error : null;
  const loading = open && !url && !error;

  useEffect(() => {
    if (!open) return;

    const requestedId = documentId;
    if (fetched?.documentId === requestedId && (fetched.url || fetched.error)) return;

    let cancelled = false;
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
    // Intentionally omit `t` and `fetched` - unstable t caused reload loops;
    // fetched-in-deps cancelled in-flight downloads during rapid switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open + documentId only
  }, [open, documentId]);

  const activeUrl = open ? url : null;
  const activeError = open ? error : null;
  const activeLoading = open ? loading : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon('actions.close')} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('preview')}</DialogTitle>
          <DialogDescription dir="ltr" style={{ unicodeBidi: 'isolate' }}>
            {filename}
          </DialogDescription>
        </DialogHeader>
        <DialogBody
          className="flex min-h-48 items-center justify-center"
          data-pf-preview-document-id={documentId}
        >
          {activeLoading ? <Spinner className="size-6" /> : null}
          {!activeLoading && activeError ? (
            <Alert tone="danger" role="alert">
              {activeError}
            </Alert>
          ) : null}
          {!activeLoading && activeUrl && showImage ? (
            // Signed URL only - expires; no permanent public path.
            // eslint-disable-next-line @next/next/no-img-element -- ephemeral signed URL
            <img
              key={`${documentId}:${activeUrl}`}
              src={activeUrl}
              alt={filename}
              className="max-h-[70vh] w-auto max-w-full rounded-md object-contain"
              onError={() =>
                setFetched({ documentId, url: null, error: t('previewFailed') })
              }
            />
          ) : null}
          {!activeLoading && activeUrl && showPdf ? (
            <iframe
              key={`${documentId}:${activeUrl}`}
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
