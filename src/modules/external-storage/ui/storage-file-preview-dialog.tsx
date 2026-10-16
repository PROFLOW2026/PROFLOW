'use client';

import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  cadMimeTypeFromFileName,
  inferCadPreviewKind,
  isStorageCadPreviewable,
} from '@/modules/documents/domain/cad-file-rules';
import {
  isBrowserPreviewableImageMime,
  isBrowserPreviewableMime,
  isBrowserPreviewablePdfMime,
} from '@/modules/documents/domain/file-rules';
import type { ProviderFileItem, StorageProviderKey } from '../client';
import {
  buildStorageFileDownloadUrl,
  type StorageBrowserScope,
} from '../client/storage-file-urls';
import {
  translatePreviewOpenInProvider,
  translatePreviewUnsupportedWithProvider,
} from './preview-open-in-provider-label';
import { CadAlternateFontsButton } from './cad/cad-alternate-fonts-button';
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

const StorageCadPreview = dynamic(
  () => import('./cad/storage-cad-preview').then((module) => module.StorageCadPreview),
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

/** CAD by extension first; PDF by `.pdf` before generic cloud MIME (e.g. octet-stream). */
function inferMimeType(filename: string, mimeType?: string | null): string {
  const cadMime = cadMimeTypeFromFileName(filename);
  if (cadMime) return cadMime;
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (mimeType?.trim()) return mimeType.trim().toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

function isDialogPreviewable(filename: string, mimeType: string): boolean {
  if (isBrowserPreviewableMime(mimeType)) return true;
  return isStorageCadPreviewable(filename, mimeType);
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
  const previewableSiblings = useMemo(
    () =>
      siblingFiles?.filter((item) => {
        const mime = inferMimeType(item.name, item.mimeType);
        return isDialogPreviewable(item.name, mime);
      }) ?? [],
    [siblingFiles],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeIndexAnchor, setActiveIndexAnchor] = useState('');
  const fileSelectionAnchor = open && file?.fileId ? file.fileId : '';
  if (activeIndexAnchor !== fileSelectionAnchor) {
    setActiveIndexAnchor(fileSelectionAnchor);
    if (fileSelectionAnchor) {
      const index = previewableSiblings.findIndex((item) => item.id === file?.fileId);
      setActiveIndex(index >= 0 ? index : 0);
    } else {
      setActiveIndex(0);
    }
  }

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
  const cadKind = activeFile ? inferCadPreviewKind(activeFile.filename, mime) : null;
  const showCad = cadKind !== null;
  const showImage = !showCad && isBrowserPreviewableImageMime(mime);
  const showPdf = !showCad && isBrowserPreviewablePdfMime(mime);
  const isPreviewable = showImage || showPdf || showCad;
  const canNavigate = previewableSiblings.length > 1;

  const [mediaAnchor, setMediaAnchor] = useState('');
  const activeMediaId = open && activeFile ? activeFile.fileId : '';
  if (mediaAnchor !== activeMediaId) {
    setMediaAnchor(activeMediaId);
    setImageError(false);
    setImageLoading(Boolean(activeMediaId && showImage));
    setShareError(null);
    if (activeMediaId) {
      setReloadKey((key) => key + 1);
    }
  }

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
      headerLeading={showCad ? <CadAlternateFontsButton /> : null}
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
            {provider
              ? translatePreviewUnsupportedWithProvider(t, provider)
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
            {onOpenInProvider && provider ? (
              <Button type="button" variant="secondary" onClick={() => onOpenInProvider(activeFile)}>
                {translatePreviewOpenInProvider(t, provider)}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={handleClose}>
              {tCommon('actions.close')}
            </Button>
          </div>
        </div>
      ) : null}

      {isPreviewable && showPdf && previewUrl ? (
        <PdfJsViewer
          url={previewUrl}
          reloadKey={reloadKey}
          onRetry={handleRetry}
          onOpenOnDevice={onOpenOnDevice ? () => onOpenOnDevice(activeFile) : undefined}
          onOpenInProvider={
            onOpenInProvider && provider ? () => onOpenInProvider(activeFile) : undefined
          }
          openInProviderLabel={
            provider ? translatePreviewOpenInProvider(t, provider) : null
          }
        />
      ) : null}

      {isPreviewable && showCad && cadKind && previewUrl ? (
        <StorageCadPreview
          kind={cadKind}
          url={previewUrl}
          fileName={activeFile.filename}
          reloadKey={reloadKey}
          onRetry={handleRetry}
          onOpenOnDevice={onOpenOnDevice ? () => onOpenOnDevice(activeFile) : undefined}
          siblingFiles={siblingFiles}
          scope={scope}
          projectId={projectId}
        />
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
