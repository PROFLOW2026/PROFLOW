'use client';

import { Layers, Maximize, Minimize, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/ui/cn';

export function CadPreviewChrome({
  hostRef,
  disclaimer,
  layersPanel,
  onFitView,
  onZoomIn,
  onZoomOut,
  children,
}: {
  hostRef: React.RefObject<HTMLElement | null>;
  disclaimer?: string | null;
  layersPanel?: ReactNode;
  onFitView?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  children: ReactNode;
}) {
  const t = useTranslations('externalStorage.preview');
  const [fullscreen, setFullscreen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === hostRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [hostRef]);

  const toggleFullscreen = useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;
    if (document.fullscreenElement === host) {
      await document.exitFullscreen();
      return;
    }
    await host.requestFullscreen();
  }, [hostRef]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {disclaimer ? (
        <p className="shrink-0 border-b border-[var(--pf-border-default)] bg-[var(--pf-surface-muted)] px-3 py-2 text-xs text-[var(--pf-text-secondary)]">
          {disclaimer}
        </p>
      ) : null}
      <div className="relative min-h-0 flex-1">{children}</div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--pf-border-default)] px-2 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {onFitView ? (
            <Button type="button" size="sm" variant="secondary" onClick={onFitView} aria-label={t('fitPage')}>
              <Scan className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t('fitPage')}</span>
            </Button>
          ) : null}
          {onZoomOut ? (
            <Button type="button" size="sm" variant="secondary" onClick={onZoomOut} aria-label={t('zoomOut')}>
              <ZoomOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t('zoomOut')}</span>
            </Button>
          ) : null}
          {onZoomIn ? (
            <Button type="button" size="sm" variant="secondary" onClick={onZoomIn} aria-label={t('zoomIn')}>
              <ZoomIn className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t('zoomIn')}</span>
            </Button>
          ) : null}
          {layersPanel ? (
            <Button
              type="button"
              size="sm"
              variant={layersOpen ? 'primary' : 'secondary'}
              onClick={() => setLayersOpen((open) => !open)}
              aria-expanded={layersOpen}
            >
              <Layers className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t('cadLayers')}</span>
            </Button>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void toggleFullscreen()}
          aria-label={fullscreen ? t('exitFullscreen') : t('fullscreen')}
        >
          {fullscreen ? <Minimize className="size-4" aria-hidden /> : <Maximize className="size-4" aria-hidden />}
          <span className="hidden sm:inline">{fullscreen ? t('exitFullscreen') : t('fullscreen')}</span>
        </Button>
      </div>
      {layersPanel && layersOpen ? (
        <div
          className={cn(
            'absolute z-20 max-h-[min(50vh,320px)] w-[min(92vw,280px)] overflow-auto rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-surface-elevated)] p-2 shadow-lg',
            'bottom-14 end-2',
          )}
        >
          {layersPanel}
        </div>
      ) : null}
    </div>
  );
}
