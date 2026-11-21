'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { EffectiveDetection } from '../domain/contracts';
import { maskB64ToImageData } from './symbol-glyph';

export function TakeoffSymbolGlyph({
  detection,
  svgMarkup,
  className,
  testId = 'takeoff-symbol-glyph',
}: {
  detection: Pick<EffectiveDetection, 'id' | 'maskB64' | 'colorHex'>;
  sheet?: { previewUrl?: string | null } | null;
  svgMarkup?: string | null;
  mode?: 'thumb' | 'focus' | 'context';
  highlight?: boolean;
  className?: string;
  testId?: string;
}) {
  const t = useTranslations('takeoff');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const box = className ?? 'size-12 shrink-0';
  const mask = useMemo(
    () => (detection.maskB64 ? maskB64ToImageData(detection.maskB64, '#111827') : null),
    [detection.maskB64],
  );
  const showSvg = !mask && Boolean(svgMarkup?.includes('<svg') && svgMarkup.includes('path'));

  useEffect(() => {
    if (!mask || !canvasRef.current) return;
    canvasRef.current.width = 64;
    canvasRef.current.height = 64;
    canvasRef.current.getContext('2d')?.putImageData(mask, 0, 0);
  }, [mask]);

  const state = mask ? 'mask' : showSvg ? 'svg' : 'empty';

  return (
    <div className={`relative overflow-hidden rounded-md ${box}`} data-testid={testId} data-glyph-state={state}>
      <canvas
        ref={canvasRef}
        className={`h-full w-full bg-white ${state === 'mask' ? '' : 'hidden'}`}
        aria-hidden={state !== 'mask'}
      />
      {state === 'svg' && svgMarkup ? (
        <div
          className="h-full w-full bg-white"
          aria-label={t('guide.symbolCaption')}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      ) : null}
      {state === 'empty' ? (
        <p
          className="flex h-full w-full items-center justify-center bg-[var(--pf-bg-muted)] px-1 text-center text-[10px] leading-tight text-[var(--pf-text-muted)]"
          role="status"
        >
          {t('guide.symbolUnavailableShort')}
        </p>
      ) : null}
    </div>
  );
}
