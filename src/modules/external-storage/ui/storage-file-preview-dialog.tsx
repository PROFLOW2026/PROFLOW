'use client';

import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import {
  isBrowserPreviewableImageMime,
  isBrowserPreviewablePdfMime,
} from '@/modules/documents/domain/file-rules';
import type { ProviderFileItem } from '../client';
import {
  buildStorageFileDownloadUrl,
  type StorageBrowserScope,
} from '../client/storage-file-urls';

type PreviewTarget = {
  fileId: string;
  filename: string;
  mimeType: string;
};

function inferMimeType(filename: string, mimeType?: string | null): string {
  if (mimeType?.trim()) return mimeType.trim().toLowerCase();
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  const clampScale = (value: number) => Math.min(4, Math.max(0.5, value));

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    setScale((prev) => clampScale(prev + (event.deltaY < 0 ? 0.1 : -0.1)));
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch' && (event as React.PointerEvent & { isPrimary?: boolean }).isPrimary !== false) {
      dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (event.clientX - dragRef.current.x),
      y: dragRef.current.oy + (event.clientY - dragRef.current.y),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length === 2) {
      const [a, b] = [event.touches[0]!, event.touches[1]!];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = { distance, scale };
    }
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    const [a, b] = [event.touches[0]!, event.touches[1]!];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const next = clampScale((pinchRef.current.scale * distance) / pinchRef.current.distance);
    setScale(next);
  };

  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      className="relative flex max-h-[75vh] min-h-[40vh] w-full touch-none items-center justify-center overflow-hidden rounded-md bg-[var(--pf-surface-muted)]"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- proxied same-origin blob */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-full max-w-full select-none object-contain transition-transform duration-75"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
      />
    </div>
  );
}

function PdfPreview({ src, title }: { src: string; title: string }) {
  const [scale, setScale] = useState(1);
  const clampScale = (value: number) => Math.min(2.5, Math.max(0.75, value));

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-end gap-1">
        <Button type="button" size="sm" variant="secondary" onClick={() => setScale((s) => clampScale(s - 0.15))}>
          <Minus className="size-4" aria-hidden />
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setScale(1)}>
          <RotateCcw className="size-4" aria-hidden />
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setScale((s) => clampScale(s + 0.15))}>
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="max-h-[75vh] min-h-[40vh] w-full overflow-auto rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-surface-muted)]">
        <iframe
          title={title}
          src={src}
          className="h-[75vh] w-full origin-top-left border-0"
          style={{ transform: `scale(${scale})`, width: `${100 / scale}%`, height: `${75 / scale}vh` }}
        />
      </div>
    </div>
  );
}

export function StorageFilePreviewDialog({
  open,
  onOpenChange,
  scope,
  projectId,
  file,
  siblingFiles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: StorageBrowserScope;
  projectId?: string;
  file: PreviewTarget | null;
  siblingFiles?: readonly ProviderFileItem[];
}) {
  const t = useTranslations('externalStorage.preview');
  const tCommon = useTranslations('common');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const previewableSiblings =
    siblingFiles?.filter((item) => {
      const mime = inferMimeType(item.name, item.mimeType);
      return isBrowserPreviewableImageMime(mime) || isBrowserPreviewablePdfMime(mime);
    }) ?? [];

  const activeFile = (() => {
    if (!file) return null;
    if (previewableSiblings.length === 0) return file;
    const fromIndex = previewableSiblings[activeIndex];
    if (!fromIndex) return file;
    return {
      fileId: fromIndex.id,
      filename: fromIndex.name,
      mimeType: inferMimeType(fromIndex.name, fromIndex.mimeType),
    };
  })();

  const loadPreview = useCallback(async (target: PreviewTarget) => {
    setLoading(true);
    setError(null);
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
      setBlobUrl(null);
    }
    try {
      const response = await fetch(
        buildStorageFileDownloadUrl({
          scope,
          fileId: target.fileId,
          projectId,
          disposition: 'inline',
        }),
        { credentials: 'include' },
      );
      if (!response.ok) {
        setError(t('failed'));
        return;
      }
      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);
      blobUrlRef.current = nextUrl;
      setBlobUrl(nextUrl);
    } catch {
      setError(t('failed'));
    } finally {
      setLoading(false);
    }
  }, [projectId, scope, t]);

  useEffect(() => {
    if (!open || !activeFile) return;
    void loadPreview(activeFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when active file changes
  }, [open, activeFile?.fileId]);

  useEffect(() => {
    if (!open) return;
    const index = previewableSiblings.findIndex((item) => item.id === file?.fileId);
    setActiveIndex(index >= 0 ? index : 0);
  }, [open, file?.fileId, previewableSiblings]);

  useEffect(
    () => () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    },
    [],
  );

  const mime = activeFile ? inferMimeType(activeFile.filename, activeFile.mimeType) : '';
  const showImage = isBrowserPreviewableImageMime(mime);
  const showPdf = isBrowserPreviewablePdfMime(mime);
  const canNavigate = previewableSiblings.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={tCommon('actions.close')}
        className="flex max-h-[95dvh] w-[min(100vw-1rem,56rem)] max-w-[100vw] flex-col sm:max-h-[90vh]"
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          {activeFile ? (
            <DialogDescription dir="ltr" style={{ unicodeBidi: 'isolate' }}>
              {activeFile.filename}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogBody className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden">
          {loading ? <Spinner className="size-6" label={t('loading')} /> : null}
          {!loading && error ? <Alert tone="danger">{error}</Alert> : null}
          {!loading && blobUrl && showImage ? (
            <ZoomableImage src={blobUrl} alt={activeFile?.filename ?? ''} />
          ) : null}
          {!loading && blobUrl && showPdf ? (
            <PdfPreview src={blobUrl} title={activeFile?.filename ?? 'PDF'} />
          ) : null}
          {!loading && blobUrl && !showImage && !showPdf ? (
            <Alert tone="info">{t('unsupported')}</Alert>
          ) : null}
          {canNavigate ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={activeIndex <= 0}
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              >
                <ChevronRight className="size-4 rotate-180" aria-hidden />
                {t('previous')}
              </Button>
              <span className="text-sm text-[var(--pf-text-secondary)]">
                {activeIndex + 1} / {previewableSiblings.length}
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={activeIndex >= previewableSiblings.length - 1}
                onClick={() => setActiveIndex((i) => Math.min(previewableSiblings.length - 1, i + 1))}
              >
                {t('next')}
                <ChevronLeft className="size-4 rotate-180" aria-hidden />
              </Button>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {tCommon('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
