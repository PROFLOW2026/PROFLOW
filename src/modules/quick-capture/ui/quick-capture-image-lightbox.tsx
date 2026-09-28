'use client';

import { ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
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

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setZoomIndex(0);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  const zoomIn = useCallback(() => {
    setZoomIndex((current) => Math.min(current + 1, ZOOM_STEPS.length - 1));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomIndex((current) => Math.max(current - 1, 0));
  }, []);

  const scale = ZOOM_STEPS[zoomIndex] ?? 1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        closeLabel={t('close')}
        mobileSheet={false}
        className="w-[min(96vw,960px)] max-w-none gap-0 p-0"
      >
        <DialogHeader className="flex flex-row items-center gap-3 border-b px-4 py-3">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium">
            {t('title')}
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-9 min-w-9 px-2"
              disabled={zoomIndex <= 0}
              onClick={zoomOut}
              aria-label={t('zoomOut')}
            >
              <ZoomOut className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-9 min-w-9 px-2"
              disabled={zoomIndex >= ZOOM_STEPS.length - 1}
              onClick={zoomIn}
              aria-label={t('zoomIn')}
            >
              <ZoomIn className="size-4" aria-hidden />
            </Button>
          </div>
        </DialogHeader>

        <DialogBody
          className={cn(
            'overflow-auto bg-[var(--pf-bg-muted)] p-0',
            'touch-pan-x touch-pan-y',
          )}
          onClick={() => handleOpenChange(false)}
        >
          <div className="flex min-h-[min(70vh,720px)] items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-[min(70vh,720px)] max-w-full object-contain transition-transform duration-150"
              style={{ transform: `scale(${scale})` }}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
