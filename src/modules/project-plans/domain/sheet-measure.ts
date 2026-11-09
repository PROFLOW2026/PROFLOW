/** Euclidean distance between two points in the same coordinate space (e.g. normalized 0..1 or pixels). */
export function pointDistance(
  p1: readonly [number, number],
  p2: readonly [number, number],
): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.hypot(dx, dy);
}

/** Local sheet measure: length = pixel (or normalized) distance × scale (meters per unit). */
export function measureLengthMeters(
  points: readonly [readonly [number, number], readonly [number, number]],
  scale: number,
): number {
  return pointDistance(points[0], points[1]) * scale;
}

/** Pixel-space distance on a rendered page from normalized 0..1 mark points. */
export function measurePixelDistance(
  points: readonly [readonly [number, number], readonly [number, number]],
  pageWidth: number,
  pageHeight: number,
): number {
  const p1: [number, number] = [points[0][0] * pageWidth, points[0][1] * pageHeight];
  const p2: [number, number] = [points[1][0] * pageWidth, points[1][1] * pageHeight];
  return pointDistance(p1, p2);
}

export function formatMeasureMeters(lengthM: number): string {
  if (!Number.isFinite(lengthM)) return '—';
  if (lengthM < 0.01) return `${lengthM.toExponential(2)} m`;
  return `${lengthM.toFixed(lengthM >= 10 ? 2 : 3)} m`;
}
