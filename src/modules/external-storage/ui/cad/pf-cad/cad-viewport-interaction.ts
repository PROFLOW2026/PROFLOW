/** Pointer / wheel / pinch navigation for the CAD canvas (no React deps). */

export type ViewportNavCallbacks = {
  panBy: (dxPx: number, dyPx: number) => void;
  zoomAt: (sx: number, sy: number, factor: number) => void;
  panAndZoomAt?: (dxPx: number, dyPx: number, sx: number, sy: number, factor: number) => void;
  /** True while two-finger pinch is active (defer heavy overlay work). */
  onPinchGesture?: (active: boolean) => void;
};

function canvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const dpr = canvas.width / Math.max(rect.width, 1);
  return [(clientX - rect.left) * dpr, (clientY - rect.top) * dpr];
}

export function attachCadViewportInteraction(
  canvas: HTMLCanvasElement,
  callbacks: ViewportNavCallbacks,
): () => void {
  let drag: { x: number; y: number; pointerId: number } | null = null;
  let pinch: { dist: number; midX: number; midY: number } | null = null;
  const activePointers = new Map<number, { x: number; y: number }>();

  let pinchGestureActive = false;
  const setPinchGesture = (active: boolean) => {
    if (pinchGestureActive === active) return;
    pinchGestureActive = active;
    callbacks.onPinchGesture?.(active);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    canvas.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    } else if (activePointers.size === 2) {
      drag = null;
      const pts = [...activePointers.values()];
      const a = pts[0]!;
      const b = pts[1]!;
      pinch = {
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
      setPinchGesture(true);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size >= 2 && pinch) {
      const pts = [...activePointers.values()];
      const a = pts[0]!;
      const b = pts[1]!;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      if (pinch.dist > 1e-3) {
        const factor = dist / pinch.dist;
        const rect = canvas.getBoundingClientRect();
        const dpr = canvas.width / Math.max(rect.width, 1);
        const [sx, sy] = canvasPoint(canvas, midX, midY);
        const dxPx = (midX - pinch.midX) * dpr;
        const dyPx = (midY - pinch.midY) * dpr;
        if (callbacks.panAndZoomAt) {
          callbacks.panAndZoomAt(dxPx, dyPx, sx, sy, factor);
        } else {
          callbacks.panBy(dxPx, dyPx);
          callbacks.zoomAt(sx, sy, factor);
        }
      }
      pinch = { dist, midX, midY };
      return;
    }

    if (drag && e.pointerId === drag.pointerId) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      if (dx !== 0 || dy !== 0) {
        const rect = canvas.getBoundingClientRect();
        const dpr = canvas.width / Math.max(rect.width, 1);
        callbacks.panBy(dx * dpr, dy * dpr);
      }
    }
  };

  const endPointer = (e: PointerEvent) => {
    activePointers.delete(e.pointerId);
    if (drag?.pointerId === e.pointerId) drag = null;
    if (activePointers.size < 2) {
      if (pinch) setPinchGesture(false);
      pinch = null;
    }
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    const [sx, sy] = canvasPoint(canvas, e.clientX, e.clientY);
    callbacks.zoomAt(sx, sy, factor);
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', endPointer);
    canvas.removeEventListener('pointercancel', endPointer);
    canvas.removeEventListener('wheel', onWheel);
  };
}
