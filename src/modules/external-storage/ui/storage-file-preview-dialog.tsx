'use client';

import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  isBrowserPreviewableImageMime,
  isBrowserPreviewableMime,
  isBrowserPreviewablePdfMime,
} from '@/modules/documents/domain/file-rules';
import type { ProviderFileItem, StorageProviderKey } from '../client';
import { STORAGE_PROVIDER_LABELS } from '../client';
import {
  buildStorageFileDownloadUrl,
  type StorageBrowserScope,
} from '../client/storage-file-urls';
import { StorageFilePreviewShell } from './storage-file-preview-shell';
import { StorageLoadingOverlay } from './storage-loading-overlay';
import { useShareStorageFile } from './use-share-storage-file';
import { ZoomablePreviewImage } from './zoomable-preview-image';

const PdfJsViewer = dynamic(
  () => import('./pdf-js-viewer').then((module) => module.PdfJsViewer),
  {
    ssr: false,
    loading: () => <div className="relative min-h-0 flex-1" aria-busy="true" />,
  },
);

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
  onOpenInProvider,
  provider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: StorageBrowserScope;
  projectId?: string;
  file: PreviewTarget | null;
  siblingFiles?: readonly ProviderFileItem[];
  onOpenOnDevice?: (file: PreviewTarget) => void;
  onOpenInProvider?: (file: PreviewTarget) => void;
  provider?: StorageProviderKey;
}) {
  const t = useTranslations('externalStorage.preview');
  const tCommon = useTranslations('common');
  const { sharing, shareError, setShareError, shareFile } = useShareStorageFile();
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

  const shareDownloadUrl = useMemo(() => {
    if (!activeFile) return null;
    return buildStorageFileDownloadUrl({
      scope,
      fileId: activeFile.fileId,
      projectId,
      disposition: 'attachment',
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
  const providerLabel = provider ? STORAGE_PROVIDER_LABELS[provider] : null;

  useEffect(() => {
    if (!open) return;
    const index = previewableSiblings.findIndex((item) => item.id === file?.fileId);
    setActiveIndex(index >= 0 ? index : 0);
  }, [open, file?.fileId, previewableSiblings]);

  useEffect(() => {
    if (!open || !activeFile) return;
    setImageError(false);
    setImageLoading(showImage);
    setShareError(null);
    setReloadKey((key) => key + 1);
  }, [open, activeFile?.fileId, showImage, setShareError]);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleRetry = useCallback(() => {
    setImageError(false);
    setImageLoading(showImage);
    setReloadKey((key) => key + 1);
  }, [showImage]);

  const handleShare = useCallback(() => {
    if (!activeFile || !shareDownloadUrl) return;
    void shareFile({
      downloadUrl: shareDownloadUrl,
      filename: activeFile.filename,
      mimeType: activeFile.mimeType,
    });
  }, [activeFile, shareDownloadUrl, shareFile]);

  if (!open || !activeFile) return null;

  return (
    <StorageFilePreviewShell
      open={open}
      onClose={handleClose}
      closeLabel={tCommon('actions.close')}
      title={activeFile.filename}
      headerActions={
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={sharing}
          onClick={handleShare}
          aria-label={t('share')}
        >
          <Share2 className="size-4" aria-hidden />
          <span className="hidden sm:inline">{t('share')}</span>
        </Button>
      }
    >
      {sharing ? <StorageLoadingOverlay label={t('sharePreparing')} blocking /> : null}
      {shareError ? (
        <div className="absolute inset-x-0 top-0 z-30 px-3 py-2">
          <Alert tone="danger">{shareError}</Alert>
        </div>
      ) : null}

      {!isPreviewable ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <Alert tone="info">
            {providerLabel
              ? t('unsupportedWithProvider', { provider: providerLabel })
              : t('unsupported')}
          </Alert>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" variant="primary" onClick={handleShare} disabled={sharing}>
              {t('share')}
            </Button>
            {onOpenOnDevice ? (
              <Button type="button" variant="secondary" onClick={() => onOpenOnDevice(activeFile)}>
                {t('openOnDevice')}
              </Button>
            ) : null}
            {onOpenInProvider && providerLabel ? (
              <Button type="button" variant="secondary" onClick={() => onOpenInProvider(activeFile)}>
                {t('openInProvider', { provider: providerLabel })}
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
        <div className="relative min-h-0 flex-1">
          {imageLoading ? <StorageLoadingOverlay label={t('loading')} /> : null}
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
        </div>
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
