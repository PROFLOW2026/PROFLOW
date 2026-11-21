'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { EffectiveDetection, SheetDto } from '../domain/contracts';
import { symbolCropSource } from './review-guide';
import { maskB64ToImageData } from './symbol-glyph';

export function TakeoffSymbolGlyph({
  detection,
  sheet,
  svgMarkup,
  mode = 'thumb',
  highlight = true,
  className,
  testId = 'takeoff-symbol-glyph',
}: {
  detection: Pick<EffectiveDetection, 'id' | 'x' | 'y' | 'w' | 'h' | 'maskB64' | 'colorHex'>;
  sheet?: SheetDto | null;
  svgMarkup?: string | null;
  mode?: 'thumb' | 'focus' | 'context';
  highlight?: boolean;
  className?: string;
  testId?: string;
}) {
  const t = useTranslations('takeoff');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cropKey, setCropKey] = useState('');
  const box = className ?? 'size-12 shrink-0';
  const mask = useMemo(
    () => (detection.maskB64 ? maskB64ToImageData(detection.maskB64, detection.colorHex) : null),
    [detection.colorHex, detection.maskB64],
  );
  const showSvg = !mask && Boolean(svgMarkup?.includes('<svg'));
  const canCrop = !mask && !showSvg && Boolean(sheet?.previewUrl && detection.w > 0 && detection.h > 0);
  const requestKey = `${detection.id}:${mode}:${sheet?.previewUrl ?? ''}:${detection.x}:${detection.y}`;
  const showCrop = canCrop && cropKey === requestKey;

  useEffect(() => {
    if (!mask || !canvasRef.current) return;
    canvasRef.current.width = 64;
    canvasRef.current.height = 64;
    canvasRef.current.getContext('2d')?.putImageData(mask, 0, 0);
  }, [mask]);

  useEffect(() => {
    if (!canCrop || !sheet?.previewUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      const context = canvas.getContext('2d');
      if (!context || image.naturalWidth < 1) return;
      const source = symbolCropSource(
        detection,
        sheet,
        { width: image.naturalWidth, height: image.naturalHeight },
        mode,
      );
      const frame = mode === 'thumb' ? 72 : 280;
      canvas.width = frame;
      canvas.height = frame;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, frame, frame);
      try {
        context.drawImage(image, source.sx, source.sy, source.sw, source.sh, 0, 0, frame, frame);
      } catch {
        return;
      }
      if (highlight) {
        const scale = frame / source.sw;
        const scaleY = frame / source.sh;
        const boxW = detection.w * (image.naturalWidth / sheet.widthPx) * scale;
        const boxH = detection.h * (image.naturalHeight / sheet.heightPx) * scaleY;
        const centerX = (detection.x * (image.naturalWidth / sheet.widthPx) - source.sx) * scale;
        const centerY = (detection.y * (image.naturalHeight / sheet.heightPx) - source.sy) * scaleY;
        context.strokeStyle = '#ea580c';
        context.lineWidth = mode === 'thumb' ? 1.5 : 2;
        context.strokeRect(centerX - boxW / 2, centerY - boxH / 2, boxW, boxH);
      }
      setCropKey(requestKey);
    };
    image.src = sheet.previewUrl;
    return () => {
      cancelled = true;
    };
  }, [canCrop, detection, highlight, mode, requestKey, sheet]);

  const state = mask ? 'mask' : showSvg ? 'svg' : showCrop ? 'crop' : 'empty';

  return (
    <div className={`relative overflow-hidden rounded-md ${box}`} data-testid={testId} data-glyph-state={state}>
      <canvas
        ref={canvasRef}
        className={`h-full w-full bg-white ${state === 'mask' || state === 'crop' ? '' : 'hidden'}`}
        aria-hidden={state === 'svg' || state === 'empty'}
      />
      {state === 'svg' && svgMarkup ? (
        <div
          className="h-full w-full bg-white"
          aria-label={t('guide.symbolCaption')}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      ) : null}
      {state === 'empty' ? (
        <p className="flex h-full w-full items-center justify-center border border-dashed border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-1 text-center text-[10px] leading-tight text-[var(--pf-text-muted)]" role="status">
          {t('guide.symbolUnavailableShort')}
        </p>
      ) : null}
    </div>
  );
}
