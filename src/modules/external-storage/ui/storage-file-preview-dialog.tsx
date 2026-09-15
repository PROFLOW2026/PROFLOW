'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  isBrowserPreviewableImageMime,
  isBrowserPreviewableMime,
  isBrowserPreviewablePdfMime,
} from '@/modules/documents/domain/file-rules';
import type { ProviderFileItem } from '../client';
import {
  buildStorageFileDownloadUrl,
  type StorageBrowserScope,
} from '../client/storage-file-urls';
import { PdfJsViewer } from './pdf-js-viewer';
import { StorageFilePreviewShell } from './storage-file-preview-shell';
import { ZoomablePreviewImage } from './zoomable-preview-image';

type PreviewTarget = {
  fileId: string;
  filename: string;
  mimeType: string;
};

function inferMimeType(filename: string, mimeType?: string | null): string {
  if (mimeType?.trim()) return mimeType.trim().toLowerCase();
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

export function StorageFilePreviewDialog({
  open,
  onOpenChange,
  scope,
  projectId,
  file,
  siblingFiles,
  onOpenOnDevice,
  onOpenInOneDrive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: StorageBrowserScope;
  projectId?: string;
  file: PreviewTarget | null;
  siblingFiles?: readonly ProviderFileItem[];
  onOpenOnDevice?: (file: PreviewTarget) => void;
  onOpenInOneDrive?: (file: PreviewTarget) => void;
}) {
  const t = useTranslations('externalStorage.preview');
  const tCommon = useTranslations('common');
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const previewableSiblings =
    siblingFiles?.filter((item) => {
      const mime = inferMimeType(item.name, item.mimeType);
      return isBrowserPreviewableMime(mime);
    }) ?? [];

  const activeFile = (() => {
    if (!file) return null;
    if (previewableSiblings.length === 0) return file;
    const fromIndex = previewableSiblings[activeIndex];
    if (!fromIndex) return file;
    return {
      fileId: fromIndex.id,
      filename: fromIndex.name,
      mimeType: inferMimeType(fromIndex.name, fromIndex.mimeType),
    };
  })();

  const previewUrl = useMemo(() => {
    if (!activeFile) return null;
    return buildStorageFileDownloadUrl({
      scope,
      fileId: activeFile.fileId,
      projectId,
      disposition: 'inline',
    });
  }, [activeFile, projectId, scope]);

  const previewUrlWithReload = previewUrl
    ? `${previewUrl}${previewUrl.includes('?') ? '&' : '?'}_r=${reloadKey}`
    : null;

  const mime = activeFile ? inferMimeType(activeFile.filename, activeFile.mimeType) : '';
  const showImage = isBrowserPreviewableImageMime(mime);
  const showPdf = isBrowserPreviewablePdfMime(mime);
  const isPreviewable = showImage || showPdf;
  const canNavigate = previewableSiblings.length > 1;

  useEffect(() => {
    if (!open) return;
    const index = previewableSiblings.findIndex((item) => item.id === file?.fileId);
    setActiveIndex(index >= 0 ? index : 0);
  }, [open, file?.fileId, previewableSiblings]);

  useEffect(() => {
    if (!open || !activeFile) return;
    setImageError(false);
    setImageLoading(showImage);
    setReloadKey((key) => key + 1);
  }, [open, activeFile?.fileId, showImage]);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleRetry = useCallback(() => {
    setImageError(false);
    setImageLoading(showImage);
    setReloadKey((key) => key + 1);
  }, [showImage]);

  if (!open || !activeFile) return null;

  return (
    <StorageFilePreviewShell
      open={open}
      onClose={handleClose}
      closeLabel={tCommon('actions.close')}
      title={activeFile.filename}
    >
      {!isPreviewable ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <Alert tone="info">{t('unsupported')}</Alert>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onOpenOnDevice ? (
              <Button type="button" variant="primary" onClick={() => onOpenOnDevice(activeFile)}>
                {t('openOnDevice')}
              </Button>
            ) : null}
            {onOpenInOneDrive ? (
              <Button type="button" variant="secondary" onClick={() => onOpenInOneDrive(activeFile)}>
                {t('openInOneDrive')}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={handleClose}>
              {tCommon('actions.close')}
            </Button>
          </div>
        </div>
      ) : null}

      {isPreviewable && showPdf && previewUrl ? (
        <PdfJsViewer url={previewUrl} reloadKey={reloadKey} onRetry={handleRetry} />
      ) : null}

      {isPreviewable && showImage && previewUrlWithReload ? (
        <>
          {imageLoading ? (
            <div className="absolute inset-x-0 top-16 flex justify-center py-8">
              <Spinner className="size-6" label={t('loading')} />
            </div>
          ) : null}
          {imageError ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4">
              <Alert tone="danger">{t('failed')}</Alert>
              <Button type="button" variant="secondary" onClick={handleRetry}>
                {t('retry')}
              </Button>
            </div>
          ) : (
            <ZoomablePreviewImage
              src={previewUrlWithReload}
              alt={activeFile.filename}
              onLoad={() => {
                setImageLoading(false);
                setImageError(false);
              }}
              onError={() => {
                setImageLoading(false);
                setImageError(true);
              }}
            />
          )}
        </>
      ) : null}

      {canNavigate && isPreviewable ? (
        <div className="flex shrink-0 items-center justify-center gap-2 border-t border-[var(--pf-border-default)] px-3 py-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={activeIndex <= 0}
            onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
          >
            <ChevronRight className="size-4 rotate-180" aria-hidden />
            {t('previous')}
          </Button>
          <span className="text-sm text-[var(--pf-text-secondary)]">
            {activeIndex + 1} / {previewableSiblings.length}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={activeIndex >= previewableSiblings.length - 1}
            onClick={() =>
              setActiveIndex((index) => Math.min(previewableSiblings.length - 1, index + 1))
            }
          >
            {t('next')}
            <ChevronLeft className="size-4 rotate-180" aria-hidden />
          </Button>
        </div>
      ) : null}
    </StorageFilePreviewShell>
  );
}
