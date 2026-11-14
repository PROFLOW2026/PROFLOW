# BUG-03 — Code excerpts (evidence)

Paths relative to repo root: `projectflow/`

## Transform zoom vs layout width (`pdf-js-viewer.tsx`)

```177:184:src/modules/external-storage/ui/pdf-js-viewer.tsx
  const commitGestureZoom = useCallback(() => {
    const scale = gestureScaleRef.current;
    if (scale === 1) return;
    setZoomFactor((current) => clampPdfZoom(current * scale));
    setGestureScale(1);
    gestureScaleRef.current = 1;
    setFitMode('custom');
  }, []);
```

```642:648:src/modules/external-storage/ui/pdf-js-viewer.tsx
            <div
              className="flex w-full flex-col items-center gap-4 origin-top"
              style={
                visualScale !== 1
                  ? { transform: `scale(${visualScale})`, transformOrigin: 'top center' }
                  : undefined
              }
```

```606:617:src/modules/external-storage/ui/pdf-js-viewer.tsx
      <div
        ref={scrollRef}
        className={cn(
          'relative min-h-0 flex-1 overflow-auto overscroll-contain bg-[var(--pf-surface-muted)]',
          isPinching ? 'touch-none' : 'touch-pan-x touch-pan-y',
          handToolActive && 'cursor-grab',
          isPanning && 'cursor-grabbing select-none',
        )}
        onMouseDown={onPanMouseDown}
        onMouseMove={onPanMouseMove}
```

```379:401:src/modules/external-storage/ui/pdf-js-viewer.tsx
  const onPanMouseDown = (event: React.MouseEvent) => {
    if (!handToolActive || event.button !== 0) return;
    // ... sets panRef from scrollLeft/scrollTop
  };
  const onPanMouseMove = (event: React.MouseEvent) => {
    // ... el.scrollLeft = panRef.current.scrollLeft - dx;
  };
```

```249:251:src/modules/external-storage/ui/pdf-js-viewer.tsx
    const onTouchStart = (event: TouchEvent) => {
      if (handToolActive) return;
      if (event.touches.length !== 2) return;
```

## Body touch lock (`storage-file-preview-shell.tsx`)

```20:24:src/modules/external-storage/ui/storage-file-preview-shell.tsx
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.width = '100%';
  body.style.touchAction = 'none';
```

## Image preview pointer pan (contrast)

```53:65:src/modules/external-storage/ui/zoomable-preview-image.tsx
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
```

## Project-plans overlay — view mode passes events through

```85:92:src/modules/project-plans/ui/drawing-sheet-marks-overlay.tsx
  const interactive = canEdit && tool !== 'view';

  return (
    <div
      className={cn(
        'absolute inset-0',
        interactive ? 'cursor-crosshair' : 'pointer-events-none',
```

## PDF page — no text/annotation pointer layers

```76:77:src/modules/external-storage/ui/pdf-lazy-page.tsx
          renderTextLayer={false}
          renderAnnotationLayer={false}
```

## Pinch commit delay constant

```22:23:src/modules/external-storage/ui/pdf-viewer-utils.ts
export const PDF_LOAD_TIMEOUT_MS = 45_000;
export const PDF_PINCH_COMMIT_MS = 120;
```
