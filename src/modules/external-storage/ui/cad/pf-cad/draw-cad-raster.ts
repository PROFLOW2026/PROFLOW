import type { CadRasterImage } from './types';
import type { CadView } from './renderer';
import { worldToScreen } from './renderer';

export type RasterDrawContext = {
  ctx: CanvasRenderingContext2D;
  view: CadView;
  viewport: { width: number; height: number };
  origin: [number, number];
  /** Resolve image file path from DWG to fetchable storage URL. */
  resolveImageUrl: (path: string) => Promise<string | null>;
};

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
const blobUrls = new Set<string>();

function loadImage(url: string): Promise<HTMLImageElement | null> {
  let pending = imageCache.get(url);
  if (!pending) {
    pending = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      if (url.startsWith('blob:')) blobUrls.add(url);
      img.src = url;
    });
    imageCache.set(url, pending);
  }
  return pending;
}

export async function drawCadRaster(
  draw: RasterDrawContext,
  img: CadRasterImage,
  _zoom: number,
): Promise<void> {
  if (!img.path?.trim() || img.corners.length < 4) return;
  const url = await draw.resolveImageUrl(img.path);
  if (!url) return;
  const el = await loadImage(url);
  if (!el) return;

  const [ox, oy] = draw.origin;
  const screen = img.corners.map(([x, y]) =>
    worldToScreen(x - ox, y - oy, draw.view, draw.viewport),
  );
  if (screen.some(([sx, sy]) => !Number.isFinite(sx) || !Number.isFinite(sy))) return;

  const [p0, p1, p2] = screen;
  const w = Math.hypot(p1![0] - p0![0], p1![1] - p0![1]);
  const h = Math.hypot(p2![0] - p1![0], p2![1] - p1![1]);
  if (w < 2 || h < 2) return;

  draw.ctx.save();
  draw.ctx.beginPath();
  draw.ctx.moveTo(screen[0]![0], screen[0]![1]);
  for (let i = 1; i < screen.length; i += 1) {
    draw.ctx.lineTo(screen[i]![0], screen[i]![1]);
  }
  draw.ctx.closePath();
  draw.ctx.clip();

  const angle = Math.atan2(p1![1] - p0![1], p1![0] - p0![0]);
  draw.ctx.translate(p0![0], p0![1]);
  draw.ctx.rotate(angle);
  draw.ctx.drawImage(el, 0, 0, w, h);
  draw.ctx.restore();
}

export function clearCadRasterCache(): void {
  imageCache.clear();
  for (const url of blobUrls) {
    URL.revokeObjectURL(url);
  }
  blobUrls.clear();
}
