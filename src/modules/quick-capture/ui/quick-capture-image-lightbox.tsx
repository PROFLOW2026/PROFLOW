'use client';

import { ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/shared/ui/cn';

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3] as const;

export function QuickCaptureImageLightbox({
  open,
  onOpenChange,
  src,
  alt,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly src: string;
  readonly alt: string;
}) {
  const t = useTranslations('quickCapture.preview');
  const [zoomIndex, setZoomIndex] = useState(0);

  useEffect(() => {
    if (!open) setZoomIndex(0);
  }, [open]);

  const zoomIn = useCallback(() => {
    setZoomIndex((current) => Math.min(current + 1, ZOOM_STEPS.length - 1));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomIndex((current) => Math.max(current - 1, 0));
  }, []);

  const scale = ZOOM_STEPS[zoomIndex] ?? 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('close')}
        mobileSheet={false}
        className="flex max-h-[min(92vh,900px)] w-[min(96vw,960px)] max-w-none flex-col gap-3 p-3 sm:p-4"
      >
        <DialogTitle className="sr-only">{t('title')}</DialogTitle>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-9"
            disabled={zoomIndex <= 0}
            onClick={zoomOut}
            aria-label={t('zoomOut')}
          >
            <ZoomOut aria-hidden />
            <span className="ms-1 hidden sm:inline">{t('zoomOut')}</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-9"
            disabled={zoomIndex >= ZOOM_STEPS.length - 1}
            onClick={zoomIn}
            aria-label={t('zoomIn')}
          >
            <ZoomIn aria-hidden />
            <span className="ms-1 hidden sm:inline">{t('zoomIn')}</span>
          </Button>
        </div>
        <div
          className={cn(
            'min-h-0 flex-1 overflow-auto rounded-md bg-[var(--pf-bg-muted)]',
            'touch-pan-x touch-pan-y',
          )}
          onClick={() => onOpenChange(false)}
        >
          <div className="flex min-h-[min(70vh,720px)] items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-[min(70vh,720px)] max-w-full object-contain transition-transform duration-150"
              style={{ transform: `scale(${scale})` }}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
