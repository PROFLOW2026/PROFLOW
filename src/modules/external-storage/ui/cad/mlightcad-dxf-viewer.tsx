'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StorageLoadingOverlay } from '../storage-loading-overlay';
import { CadPreviewChrome } from './cad-preview-chrome';
import type { AcApDocManager } from '@mlightcad/cad-simple-viewer';
import { fetchStoragePreviewBytes } from './fetch-storage-preview-bytes';

const MTEXT_WORKER_URL = '/cad-workers/mtext-renderer-worker.js';
/** Local font root — blocks default third-party CDN when no files are present yet. */
const CAD_FONT_BASE_URL = '/pf-cad/fonts/';

export function MlightcadDxfViewer({
  url,
  fileName,
  reloadKey,
  onRetry,
  onOpenOnDevice,
}: {
  url: string;
  fileName: string;
  reloadKey: number;
  onRetry: () => void;
  onOpenOnDevice?: () => void;
}) {
  return (
    <MlightcadDxfViewerInner
      key={`${url}:${reloadKey}`}
      url={url}
      fileName={fileName}
      onRetry={onRetry}
      onOpenOnDevice={onOpenOnDevice}
    />
  );
}

function MlightcadDxfViewerInner({
  url,
  fileName,
  onRetry,
  onOpenOnDevice,
}: {
  url: string;
  fileName: string;
  onRetry: () => void;
  onOpenOnDevice?: () => void;
}) {
  const t = useTranslations('externalStorage.preview');
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvasHost = canvasHostRef.current;
    if (!canvasHost) return;

    let cancelled = false;
    let docManager: AcApDocManager | undefined;

    void (async () => {
      try {
        const { AcApDocManager, AcEdOpenMode, AcApOpenViewMode } = await import(
          '@mlightcad/cad-simple-viewer'
        );

        if (cancelled) return;

        const workerUrl = MTEXT_WORKER_URL;
        const ready = await AcApDocManager.checkWebworkerReadiness({
          mtextRender: workerUrl,
        });
        if (!ready) {
          throw new Error('workers_unavailable');
        }

        docManager = AcApDocManager.createInstance({
          container: canvasHost,
          autoResize: true,
          builtinOpenFileDialog: false,
          disableExport: true,
          baseUrl: CAD_FONT_BASE_URL,
          notificationCenter: { showDefaultUi: false },
          webworkerFileUrls: {
            mtextRender: workerUrl,
          },
          checkWorkersOnInit: true,
        });
        docManager.baseUrl = CAD_FONT_BASE_URL;

        if (!docManager) {
          throw new Error('doc_manager_failed');
        }

        const bytes = await fetchStoragePreviewBytes(url);
        if (cancelled) return;

        const opened = await docManager.openDocument(fileName, bytes, {
          mode: AcEdOpenMode.Read,
          openViewMode: AcApOpenViewMode.Extents,
          progressiveRendering: true,
        });
        if (!opened) {
          throw new Error('empty_drawing');
        }
        if (cancelled) return;
        setLoading(false);
      } catch {
        if (cancelled) return;
        setError(t('cadLoadFailed'));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      void docManager?.closeDocument();
      canvasHost.replaceChildren();
    };
  }, [url, fileName, t]);

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4">
        <Alert tone="danger">{error}</Alert>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="secondary" onClick={onRetry}>
            {t('retry')}
          </Button>
          {onOpenOnDevice ? (
            <Button type="button" variant="primary" onClick={onOpenOnDevice}>
              {t('openOnDevice')}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div ref={hostRef} className="relative flex min-h-0 flex-1 flex-col">
      {loading ? <StorageLoadingOverlay label={t('cadLoadingEngine')} blocking /> : null}
      <CadPreviewChrome hostRef={hostRef}>
        <div ref={canvasHostRef} className="absolute inset-0 min-h-0" />
      </CadPreviewChrome>
    </div>
  );
}
