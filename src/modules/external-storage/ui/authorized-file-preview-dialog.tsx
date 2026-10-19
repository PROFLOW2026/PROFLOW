'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  authorizedPreviewKind,
  type AuthorizedPreviewKind,
} from '@/modules/external-storage/domain/authorized-preview';
import { isCadSupportSiblingFileName } from '@/modules/external-storage/ui/cad/pf-cad-v3/storage-cad-file-index';
import type { CadIndexedFile } from '@/modules/external-storage/ui/cad/pf-cad/xref-resolver';
import { fetchStoragePreviewBytes } from '@/modules/external-storage/ui/cad/fetch-storage-preview-bytes';
import { StorageFilePreviewShell } from '@/modules/external-storage/ui/storage-file-preview-shell';
import { StorageLoadingOverlay } from '@/modules/external-storage/ui/storage-loading-overlay';
import { ZoomablePreviewImage } from '@/modules/external-storage/ui/zoomable-preview-image';

const PdfJsViewer = dynamic(
  () => import('@/modules/external-storage/ui/pdf-js-viewer').then((module) => module.PdfJsViewer),
  { ssr: false, loading: () => <div className="relative min-h-0 flex-1" aria-busy="true" /> },
);

const StorageCadPreview = dynamic(
  () => import('@/modules/external-storage/ui/cad/storage-cad-preview').then((module) => module.StorageCadPreview),
  { ssr: false, loading: () => <div className="relative min-h-0 flex-1" aria-busy="true" /> },
);

const PfDwgVersionedViewer = dynamic(
  () =>
    import('@/modules/external-storage/ui/cad/pf-dwg-versioned-viewer').then(
      (module) => module.PfDwgVersionedViewer,
    ),
  { ssr: false, loading: () => <div className="relative min-h-0 flex-1" aria-busy="true" /> },
);

export type AuthorizedPreviewTarget = {
  readonly title: string;
  readonly fileName: string;
  readonly mimeType: string;
  /** Authorized same-origin stream. Fetched by the viewer; never navigated as a download. */
  readonly contentUrl: string;
  readonly downloadUrl: string;
};

export type AuthorizedPreviewSibling = {
  readonly fileName: string;
  readonly contentUrl: string;
};

export function AuthorizedFilePreviewDialog({
  open,
  onOpenChange,
  file,
  siblings = [],
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly file: AuthorizedPreviewTarget | null;
  readonly siblings?: readonly AuthorizedPreviewSibling[];
}) {
  const t = useTranslations('externalStorage.preview');
  const tCommon = useTranslations('common');
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [mediaKey, setMediaKey] = useState('');
  const nextMediaKey = file?.contentUrl ?? '';
  if (mediaKey !== nextMediaKey) {
    setMediaKey(nextMediaKey);
    setImageLoading(true);
    setImageError(false);
  }

  const kind: AuthorizedPreviewKind = file
    ? authorizedPreviewKind(file.fileName, file.mimeType)
    : 'unsupported';
  const indexedFiles = useMemo<CadIndexedFile[]>(() => {
    if (!file || kind !== 'dwg') return [];
    return siblings
      .filter((item) => isCadSupportSiblingFileName(item.fileName))
      .map((item) => ({
        name: item.fileName,
        getBytes: async () => new Uint8Array(await fetchStoragePreviewBytes(item.contentUrl)),
      }));
  }, [file, kind, siblings]);

  if (!open || !file) return null;

  const previewable = kind !== 'unsupported';

  return (
    <StorageFilePreviewShell
      open={open}
      onClose={() => onOpenChange(false)}
      closeLabel={tCommon('actions.close')}
      title={file.title}
      headerActions={
        <a
          href={file.downloadUrl}
          download
          className="inline-flex h-8 items-center rounded-md px-2 text-sm font-medium text-[var(--pf-text-brand)] hover:underline"
        >
          {tCommon('actions.download')}
        </a>
      }
    >
      {!previewable ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <Alert tone="info">{t('unsupported')}</Alert>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {tCommon('actions.close')}
          </Button>
        </div>
      ) : null}

      {kind === 'pdf' ? (
        <PdfJsViewer url={file.contentUrl} reloadKey={reloadKey} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : null}

      {kind === 'image' ? (
        <div className="relative min-h-0 flex-1">
          {imageLoading ? <StorageLoadingOverlay label={t('loading')} /> : null}
          {imageError ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4">
              <Alert tone="danger">{t('failed')}</Alert>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setImageError(false);
                  setImageLoading(true);
                  setReloadKey((key) => key + 1);
                }}
              >
                {t('retry')}
              </Button>
            </div>
          ) : (
            <ZoomablePreviewImage
              key={`${file.contentUrl}:${reloadKey}`}
              src={`${file.contentUrl}${file.contentUrl.includes('?') ? '&' : '?'}_r=${reloadKey}`}
              alt={file.fileName}
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageLoading(false);
                setImageError(true);
              }}
            />
          )}
        </div>
      ) : null}

      {kind === 'dwg' ? (
        <PfDwgVersionedViewer
          url={file.contentUrl}
          fileName={file.fileName}
          reloadKey={reloadKey}
          onRetry={() => setReloadKey((key) => key + 1)}
          siblingFiles={[]}
          scope="project"
          devCadIndexedFiles={indexedFiles.length > 0 ? indexedFiles : undefined}
        />
      ) : null}

      {kind === 'dxf' || kind === 'dwf' || kind === 'dwfx' ? (
        <StorageCadPreview
          kind={kind}
          url={file.contentUrl}
          fileName={file.fileName}
          reloadKey={reloadKey}
          onRetry={() => setReloadKey((key) => key + 1)}
          siblingFiles={[]}
          scope="project"
        />
      ) : null}
    </StorageFilePreviewShell>
  );
}
