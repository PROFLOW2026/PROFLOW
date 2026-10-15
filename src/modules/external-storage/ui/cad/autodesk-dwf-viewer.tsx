'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StorageLoadingOverlay } from '../storage-loading-overlay';
import { CadPreviewChrome } from './cad-preview-chrome';
import { fetchStoragePreviewBytes } from './fetch-storage-preview-bytes';

const VIEWER_VERSION = '7.130.0';
const VIEWER_BASE = `https://developer.api.autodesk.com/modelderivative/v2/viewers/${VIEWER_VERSION}`;

let viewerScriptPromise: Promise<void> | null = null;

function loadAutodeskViewerScripts(): Promise<void> {
  if (viewerScriptPromise) return viewerScriptPromise;
  viewerScriptPromise = new Promise((resolve, reject) => {
    if (typeof Autodesk !== 'undefined') {
      resolve();
      return;
    }
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${VIEWER_BASE}/style.min.css`;
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = `${VIEWER_BASE}/viewer3D.min.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('viewer_script_failed'));
    document.head.appendChild(script);
  });
  return viewerScriptPromise;
}

export function AutodeskDwfViewer({
  url,
  fileExtension,
  reloadKey,
  onRetry,
  onOpenOnDevice,
}: {
  url: string;
  fileExtension: 'dwf' | 'dwfx';
  reloadKey: number;
  onRetry: () => void;
  onOpenOnDevice?: () => void;
}) {
  return (
    <AutodeskDwfViewerInner
      key={`${url}:${reloadKey}`}
      url={url}
      fileExtension={fileExtension}
      onRetry={onRetry}
      onOpenOnDevice={onOpenOnDevice}
    />
  );
}

function AutodeskDwfViewerInner({
  url,
  fileExtension,
  onRetry,
  onOpenOnDevice,
}: {
  url: string;
  fileExtension: 'dwf' | 'dwfx';
  onRetry: () => void;
  onOpenOnDevice?: () => void;
}) {
  const t = useTranslations('externalStorage.preview');
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerHostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Autodesk.Viewing.GuiViewer3D | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = viewerHostRef.current;
    if (!container) return;

    let cancelled = false;

    void (async () => {
      try {
        await loadAutodeskViewerScripts();
        if (cancelled) return;

        await new Promise<void>((resolve) => {
          Autodesk.Viewing.Initializer({ env: 'Local', useADP: false }, () => resolve());
        });
        if (cancelled) return;

        try {
          Autodesk.Viewing.Private.analytics.disableForPage();
        } catch {
          /* optional */
        }

        const viewer = new Autodesk.Viewing.GuiViewer3D(container);
        viewer.start();
        viewer.setTheme('light-theme');
        viewerRef.current = viewer;

        await viewer.loadExtension('Autodesk.DWF');
        const bytes = await fetchStoragePreviewBytes(url);
        if (cancelled) return;

        const blobUrl = URL.createObjectURL(new Blob([bytes]));
        blobUrlRef.current = blobUrl;
        await viewer.loadModel(`${blobUrl}#.${fileExtension}`, { fileExtension });
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
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      const viewer = viewerRef.current;
      viewerRef.current = null;
      if (viewer) {
        try {
          viewer.finish();
          viewer.tearDown();
        } catch {
          /* ok */
        }
      }
      container.replaceChildren();
    };
  }, [url, fileExtension, t]);

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
    <div ref={hostRef} className="relative flex min-h-0 flex-1 flex-col bg-[var(--pf-surface-base)]">
      {loading ? <StorageLoadingOverlay label={t('cadLoadingEngine')} blocking /> : null}
      <CadPreviewChrome hostRef={hostRef}>
        <div ref={viewerHostRef} className="absolute inset-0 min-h-0" />
      </CadPreviewChrome>
    </div>
  );
}
