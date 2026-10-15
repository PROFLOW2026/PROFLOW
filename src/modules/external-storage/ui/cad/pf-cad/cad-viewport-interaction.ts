/** Pointer / wheel / pinch navigation for the CAD canvas (no React deps). */

export type ViewportNavCallbacks = {
  panBy: (dxPx: number, dyPx: number) => void;
  zoomAt: (sx: number, sy: number, factor: number) => void;
  onAfterViewChange?: () => void;
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

  const notify = () => callbacks.onAfterViewChange?.();

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
        callbacks.panBy((midX - pinch.midX) * dpr, (midY - pinch.midY) * dpr);
        callbacks.zoomAt(sx, sy, factor);
        notify();
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
        notify();
      }
    }
  };

  const endPointer = (e: PointerEvent) => {
    activePointers.delete(e.pointerId);
    if (drag?.pointerId === e.pointerId) drag = null;
    if (activePointers.size < 2) pinch = null;
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
    notify();
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
