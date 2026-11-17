/** Pixel point on a canvas to world coordinates. Zoom is pixels per world unit. */
export function worldFromClientPoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  view: { panX: number; panY: number; zoom: number },
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const sx = ((clientX - rect.left) / Math.max(rect.width, 1)) * canvas.width;
  const sy = ((clientY - rect.top) / Math.max(rect.height, 1)) * canvas.height;
  const zoom = view.zoom > 1e-9 ? view.zoom : 1e-9;
  return {
    x: (sx - canvas.width * 0.5) / zoom + view.panX,
    y: -(sy - canvas.height * 0.5) / zoom + view.panY,
  };
}
