'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { StorageLoadingOverlay } from '../storage-loading-overlay';
import { CadPreviewChrome } from './cad-preview-chrome';
import { createCodeCadSession, type CodeCadLayerRow, type CodeCadSessionHandle } from './codecad-runtime';
import { fetchStoragePreviewBytes } from './fetch-storage-preview-bytes';

export function CodecadDwgViewer({
  url,
  reloadKey,
  onRetry,
  onOpenOnDevice,
}: {
  url: string;
  reloadKey: number;
  onRetry: () => void;
  onOpenOnDevice?: () => void;
}) {
  return (
    <CodecadDwgViewerInner
      key={`${url}:${reloadKey}`}
      url={url}
      onRetry={onRetry}
      onOpenOnDevice={onOpenOnDevice}
    />
  );
}

function CodecadDwgViewerInner({
  url,
  onRetry,
  onOpenOnDevice,
}: {
  url: string;
  onRetry: () => void;
  onOpenOnDevice?: () => void;
}) {
  const t = useTranslations('externalStorage.preview');
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<CodeCadSessionHandle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<CodeCadLayerRow[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    let cancelled = false;
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setLoading(true);
    setError(null);
    setLayers([]);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    const observer = new ResizeObserver(() => resize());
    observer.observe(host);
    resize();

    void (async () => {
      try {
        const bytes = new Uint8Array(await fetchStoragePreviewBytes(url));
        if (cancelled) return;
        const session = await createCodeCadSession(canvas, bytes);
        if (cancelled) {
          session.destroy();
          return;
        }
        sessionRef.current = session;
        setLayers(session.listLayers());
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setError(message === 'empty_drawing' ? t('cadEmptyDrawing') : t('cadLoadFailed'));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      observer.disconnect();
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
  }, [url, t]);

  const handleFitView = useCallback(() => {
    sessionRef.current?.fitView();
  }, []);

  const toggleLayer = useCallback((name: string, visible: boolean) => {
    sessionRef.current?.setLayerVisible(name, visible);
    setLayers((rows) => rows.map((row) => (row.name === name ? { ...row, visible } : row)));
  }, []);

  const layersPanel =
    layers.length > 0 ? (
      <ul className="space-y-2 text-sm">
        {layers.map((layer) => (
          <li key={layer.name} className="flex items-center gap-2">
            <Checkbox
              id={`layer-${layer.name}`}
              checked={layer.visible}
              onCheckedChange={(checked) => toggleLayer(layer.name, checked === true)}
            />
            <Label htmlFor={`layer-${layer.name}`} className="truncate font-normal">
              {layer.name}
            </Label>
          </li>
        ))}
      </ul>
    ) : null;

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
    <div ref={hostRef} className="relative flex min-h-0 flex-1 flex-col bg-[#0a0e14]">
      {loading ? <StorageLoadingOverlay label={t('cadLoadingEngine')} blocking /> : null}
      <CadPreviewChrome
        hostRef={hostRef}
        disclaimer={t('cadDwgPartialNotice')}
        layersPanel={layersPanel}
        onFitView={handleFitView}
      >
        <canvas ref={canvasRef} className="size-full touch-none" aria-label={t('cadViewerCanvas')} />
      </CadPreviewChrome>
    </div>
  );
}
