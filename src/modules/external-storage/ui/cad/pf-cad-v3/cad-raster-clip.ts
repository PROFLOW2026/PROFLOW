/** Ray-cast point-in-polygon (world / RTC coords). */
export function pointInPolygon(x: number, y: number, poly: ReadonlyArray<readonly [number, number]>): boolean {
  if (poly.length < 3) return true;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-15) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export const RASTER_CLIP_MAX_VERTS = 16;

export function normalizeRasterClip(
  clip: ReadonlyArray<readonly [number, number]> | undefined,
): Float32Array {
  const out = new Float32Array(RASTER_CLIP_MAX_VERTS * 2);
  if (!clip?.length) return out;
  const n = Math.min(clip.length, RASTER_CLIP_MAX_VERTS);
  for (let i = 0; i < n; i += 1) {
    const [x, y] = clip[i]!;
    out[i * 2] = x;
    out[i * 2 + 1] = y;
  }
  return out;
}
