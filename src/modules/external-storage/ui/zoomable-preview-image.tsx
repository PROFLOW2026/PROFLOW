'use client';

import { Minus, Plus, RotateCcw, Scan } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/ui/cn';

const MIN_SCALE = 0.5;
const MAX_SCALE = 8;

export function ZoomablePreviewImage({
  src,
  alt,
  onLoad,
  onError,
}: {
  src: string;
  alt: string;
  onLoad?: () => void;
  onError?: () => void;
}) {
  const t = useTranslations('externalStorage.preview');
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [fitWidth, setFitWidth] = useState(true);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setFitWidth(true);
  }, []);

  useEffect(() => {
    resetView();
  }, [src, resetView]);

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    setFitWidth(false);
    setScale((prev) => clampScale(prev + (event.deltaY < 0 ? 0.15 : -0.15)));
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (event.clientX - dragRef.current.x),
      y: dragRef.current.oy + (event.clientY - dragRef.current.y),
    });
  };

  const onPointerUp = (event: React.PointerEvent) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length === 2) {
      const [a, b] = [event.touches[0]!, event.touches[1]!];
      pinchRef.current = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale };
      setFitWidth(false);
    }
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    event.preventDefault();
    const [a, b] = [event.touches[0]!, event.touches[1]!];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    setScale(clampScale((pinchRef.current.scale * distance) / pinchRef.current.distance));
  };

  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-1 border-b border-[var(--pf-border-default)] px-2 py-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => { setFitWidth(false); setScale((s) => clampScale(s - 0.25)); }}>
          <Minus className="size-4" aria-hidden />
          <span className="sr-only">{t('zoomOut')}</span>
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={resetView}>
          <RotateCcw className="size-4" aria-hidden />
          <span className="sr-only">{t('reset')}</span>
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => { setFitWidth(false); setScale((s) => clampScale(s + 0.25)); }}>
          <Plus className="size-4" aria-hidden />
          <span className="sr-only">{t('zoomIn')}</span>
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => { setFitWidth(true); setOffset({ x: 0, y: 0 }); setScale(1); }}>
          <Scan className="size-4" aria-hidden />
          {t('fitWidth')}
        </Button>
      </div>
      <div
        ref={containerRef}
        className={cn(
          'relative min-h-0 flex-1 touch-manipulation overflow-auto overscroll-contain bg-[var(--pf-surface-muted)]',
        )}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex min-h-full min-w-full items-center justify-center p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- same-origin authenticated inline URL */}
          <img
            src={src}
            alt={alt}
            draggable={false}
            onLoad={onLoad}
            onError={onError}
            className={cn(
              'max-h-none select-none object-contain transition-transform duration-75',
              fitWidth ? 'h-auto w-full max-w-full' : 'max-h-none max-w-none',
            )}
            style={
              fitWidth
                ? undefined
                : { transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }
            }
          />
        </div>
      </div>
    </div>
  );
}
