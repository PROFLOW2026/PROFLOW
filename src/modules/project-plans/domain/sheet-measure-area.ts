import { measureLengthMeters, measurePixelDistance, pointDistance } from './sheet-measure';

/** Rectangle takeoff from two normalized diagonal corners (0..1). */
export function measureRectangleAreaSqMeters(
  corners: readonly [readonly [number, number], readonly [number, number]],
  scale: number,
  pageWidth: number,
  pageHeight: number,
): number {
  const [a, b] = corners;
  const widthPx = Math.abs(b[0] - a[0]) * pageWidth;
  const heightPx = Math.abs(b[1] - a[1]) * pageHeight;
  const widthM = widthPx * scale;
  const heightM = heightPx * scale;
  return widthM * heightM;
}

export function measureLineQuantityMeters(
  points: readonly [readonly [number, number], readonly [number, number]],
  scale: number,
  pageWidth: number,
  pageHeight: number,
): number {
  const pixelDist = measurePixelDistance(points, pageWidth, pageHeight);
  return measureLengthMeters(
    [
      [0, 0],
      [pixelDist, 0],
    ],
    scale,
  );
}

export function formatMeasureAreaSqM(sqM: number): string {
  if (!Number.isFinite(sqM)) return '—';
  if (sqM < 0.01) return `${sqM.toExponential(2)} m²`;
  return `${sqM.toFixed(sqM >= 10 ? 2 : 3)} m²`;
}

/** Shoelace polygon area in normalized space, then scaled to square meters. */
export function measurePolygonAreaSqMeters(
  points: readonly (readonly [number, number])[],
  scale: number,
  pageWidth: number,
  pageHeight: number,
): number {
  if (points.length < 3) return 0;
  let areaNorm = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    areaNorm += points[i]![0] * points[j]![1];
    areaNorm -= points[j]![0] * points[i]![1];
  }
  areaNorm = Math.abs(areaNorm) / 2;
  const pixelArea = areaNorm * pageWidth * pageHeight;
  const linearScale = scale;
  return pixelArea * linearScale * linearScale;
}

export function polygonPerimeterPx(
  points: readonly (readonly [number, number])[],
  pageWidth: number,
  pageHeight: number,
): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const p1: [number, number] = [points[i]![0] * pageWidth, points[i]![1] * pageHeight];
    const p2: [number, number] = [points[j]![0] * pageWidth, points[j]![1] * pageHeight];
    total += pointDistance(p1, p2);
  }
  return total;
}
