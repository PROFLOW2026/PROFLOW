/**
 * Pure 2D geometry for the temporary infrastructure-overlay experiment.
 *
 * Maps points of the "before" photo (photo pixel space) onto the live camera
 * stage (screen pixel space) from hand-tapped landmark pairs.
 *
 * Default = least-squares SIMILARITY (translate + rotate + uniform scale):
 * robust to finger-tap noise. Perspective/affine is opt-in and sanity-gated,
 * because an exact 4-point homography through noisy taps amplifies the error
 * into a visibly skewed layer.
 */

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** Row-major 3x3 homography [a b c; d e f; g h 1] -> 9 numbers. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export type FitKind = 'similarity' | 'affine' | 'homography';

export interface FitResult {
  readonly kind: FitKind;
  readonly matrix: Mat3;
  /** RMS residual of the tapped landmarks, in destination pixels. */
  readonly rms: number;
}

export function applyMat3(m: Mat3, p: Pt): Pt {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return {
    x: (m[0] * p.x + m[1] * p.y + m[2]) / w,
    y: (m[3] * p.x + m[4] * p.y + m[5]) / w,
  };
}

export function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const r: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      let s = 0;
      for (let k = 0; k < 3; k += 1) s += a[i * 3 + k]! * b[k * 3 + j]!;
      r.push(s);
    }
  }
  return r as unknown as Mat3;
}

/** Row-major matrix -> CSS matrix3d() string (column-major, z dropped). */
export function toCssMatrix3d(m: Mat3): string {
  const n = m[8] === 0 ? 1 : m[8];
  const v = [
    m[0] / n, m[3] / n, 0, m[6] / n,
    m[1] / n, m[4] / n, 0, m[7] / n,
    0, 0, 1, 0,
    m[2] / n, m[5] / n, 0, 1,
  ];
  return `matrix3d(${v.map((x) => (Number.isFinite(x) ? x : 0).toFixed(8)).join(',')})`;
}

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function rms(m: Mat3, src: readonly Pt[], dst: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < src.length; i += 1) {
    const q = applyMat3(m, src[i]!);
    s += (q.x - dst[i]!.x) ** 2 + (q.y - dst[i]!.y) ** 2;
  }
  return Math.sqrt(s / src.length);
}

/** Least-squares similarity (Umeyama, 2D). Needs >= 2 distinct points. */
export function fitSimilarity(src: readonly Pt[], dst: readonly Pt[]): FitResult | null {
  const n = Math.min(src.length, dst.length);
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += src[i]!.x;
    sy += src[i]!.y;
    dx += dst[i]!.x;
    dy += dst[i]!.y;
  }
  sx /= n;
  sy /= n;
  dx /= n;
  dy /= n;
  // z' = a z + b  (complex), a = Σ q conj(p) / Σ |p|^2 on centred points.
  let nr = 0;
  let ni = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const px = src[i]!.x - sx;
    const py = src[i]!.y - sy;
    const qx = dst[i]!.x - dx;
    const qy = dst[i]!.y - dy;
    nr += qx * px + qy * py;
    ni += qy * px - qx * py;
    den += px * px + py * py;
  }
  if (den < 1e-9) return null;
  const ar = nr / den;
  const ai = ni / den;
  const tx = dx - (ar * sx - ai * sy);
  const ty = dy - (ai * sx + ar * sy);
  const matrix: Mat3 = [ar, -ai, tx, ai, ar, ty, 0, 0, 1];
  return { kind: 'similarity', matrix, rms: rms(matrix, src.slice(0, n), dst.slice(0, n)) };
}

function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) {
      if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    }
    if (Math.abs(m[p]![c]!) < 1e-12) return null;
    [m[c], m[p]] = [m[p]!, m[c]!];
    for (let r = c + 1; r < n; r += 1) {
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k <= n; k += 1) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = m[r]![n]!;
    for (let k = r + 1; k < n; k += 1) s -= m[r]![k]! * x[k]!;
    x[r] = s / m[r]![r]!;
  }
  return x;
}

/** Exact affine through 3 points. */
export function fitAffine(src: readonly Pt[], dst: readonly Pt[]): FitResult | null {
  if (src.length < 3 || dst.length < 3) return null;
  const rows = [0, 1, 2].map((i) => [src[i]!.x, src[i]!.y, 1]);
  const ex = solveLinear(rows, [dst[0]!.x, dst[1]!.x, dst[2]!.x]);
  const ey = solveLinear(rows, [dst[0]!.y, dst[1]!.y, dst[2]!.y]);
  if (!ex || !ey) return null;
  const matrix: Mat3 = [ex[0]!, ex[1]!, ex[2]!, ey[0]!, ey[1]!, ey[2]!, 0, 0, 1];
  return { kind: 'affine', matrix, rms: rms(matrix, src.slice(0, 3), dst.slice(0, 3)) };
}

/** Exact homography through 4 points (DLT with h33 = 1). */
export function fitHomography(src: readonly Pt[], dst: readonly Pt[]): FitResult | null {
  if (src.length < 4 || dst.length < 4) return null;
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(a, b);
  if (!h) return null;
  const matrix: Mat3 = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
  return { kind: 'homography', matrix, rms: rms(matrix, src.slice(0, 4), dst.slice(0, 4)) };
}

function polygonArea(q: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < q.length; i += 1) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function isConvex(q: readonly Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i += 1) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    const c = q[(i + 2) % q.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export const SANITY_MAX_EDGE_RATIO = 1.25;
export const SANITY_AREA_BAND: readonly [number, number] = [0.7, 1.4];

/**
 * Is a non-similarity fit plausible? The photo rectangle must map to a convex
 * quad whose opposite edges differ by a bounded ratio and whose area stays in
 * a band around the similarity fit's area. Otherwise it is just noise.
 */
export function isPlausibleWarp(
  m: Mat3,
  photoW: number,
  photoH: number,
  reference: Mat3 | null,
): boolean {
  const corners: Pt[] = [
    { x: 0, y: 0 },
    { x: photoW, y: 0 },
    { x: photoW, y: photoH },
    { x: 0, y: photoH },
  ];
  const q = corners.map((c) => applyMat3(m, c));
  if (q.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  if (!isConvex(q)) return false;
  const [top, right, bottom, left] = [dist(q[0]!, q[1]!), dist(q[1]!, q[2]!), dist(q[2]!, q[3]!), dist(q[3]!, q[0]!)];
  const ratio = (a: number, b: number) => Math.max(a, b) / Math.max(1e-9, Math.min(a, b));
  if (ratio(top, bottom) > SANITY_MAX_EDGE_RATIO || ratio(left, right) > SANITY_MAX_EDGE_RATIO) {
    return false;
  }
  if (reference) {
    const refArea = polygonArea(corners.map((c) => applyMat3(reference, c)));
    const area = polygonArea(q);
    if (refArea > 0) {
      const r = area / refArea;
      if (r < SANITY_AREA_BAND[0] || r > SANITY_AREA_BAND[1]) return false;
    }
  }
  return true;
}

export interface AlignmentInput {
  readonly photo: readonly Pt[];
  readonly live: readonly Pt[];
  readonly photoW: number;
  readonly photoH: number;
  readonly perspective: boolean;
}

export interface AlignmentResult {
  readonly fit: FitResult;
  /** True when perspective was requested but rejected by the sanity gate. */
  readonly perspectiveRejected: boolean;
}

/** Landmarks the user must mark (same order on the photo and on the camera). */
export const REQUIRED_LANDMARKS = 4;
/** Largest tolerated rotation of the old photo relative to the live view. */
export const MAX_ROTATION_RAD = (30 * Math.PI) / 180;
/** Largest tolerated landmark residual, as a fraction of the live landmark spread. */
export const MAX_RESIDUAL_FRACTION = 0.06;
/** Minimum convex-hull area of the landmarks, as a fraction of the surface area. */
export const MIN_SPREAD_AREA = 0.1;
/** Minimum bounding-box side of the landmarks, as a fraction of the surface side. */
export const MIN_SPREAD_SIDE = 0.25;

function convexHull(points: readonly Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Are normalised (0..1) landmarks spread over the surface rather than bunched together?
 * Needs all REQUIRED_LANDMARKS points.
 */
export function landmarksAreSpread(points: readonly Pt[]): boolean {
  if (points.length < REQUIRED_LANDMARKS) return false;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  if (w < MIN_SPREAD_SIDE || h < MIN_SPREAD_SIDE) return false;
  return polygonArea(convexHull(points)) >= MIN_SPREAD_AREA;
}

/** Straight (similarity) fit that is too rotated or fits the landmarks badly is not trustworthy. */
function isReliableSimilarity(fit: FitResult, live: readonly Pt[]): boolean {
  const m = fit.matrix;
  const rotation = Math.atan2(m[3], m[0]);
  if (Math.abs(rotation) > MAX_ROTATION_RAD) return false;
  const xs = live.map((p) => p.x);
  const ys = live.map((p) => p.y);
  const spread = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return spread > 0 && fit.rms <= MAX_RESIDUAL_FRACTION * spread;
}

export function computeAlignment(input: AlignmentInput): AlignmentResult | null {
  const n = Math.min(input.photo.length, input.live.length);
  if (n < 2) return null;
  const sim = fitSimilarity(input.photo.slice(0, n), input.live.slice(0, n));
  if (!sim) return null;
  // Never present an implausible result as if the alignment had succeeded.
  if (!isReliableSimilarity(sim, input.live.slice(0, n))) return null;
  if (!input.perspective || n < 3) return { fit: sim, perspectiveRejected: false };
  const warp =
    n >= 4
      ? fitHomography(input.photo.slice(0, 4), input.live.slice(0, 4))
      : fitAffine(input.photo.slice(0, 3), input.live.slice(0, 3));
  if (warp && isPlausibleWarp(warp.matrix, input.photoW, input.photoH, sim.matrix)) {
    return { fit: warp, perspectiveRejected: false };
  }
  return { fit: sim, perspectiveRejected: true };
}

/** User fine-tune (about a pivot, screen space) composed after a fit. */
export function userAdjustMatrix(
  pivot: Pt,
  adj: { readonly tx: number; readonly ty: number; readonly scale: number; readonly rotation: number },
): Mat3 {
  const c = Math.cos(adj.rotation) * adj.scale;
  const s = Math.sin(adj.rotation) * adj.scale;
  // translate(pivot + t) * rotate/scale * translate(-pivot)
  const tx = pivot.x + adj.tx - (c * pivot.x - s * pivot.y);
  const ty = pivot.y + adj.ty - (s * pivot.x + c * pivot.y);
  return [c, -s, tx, s, c, ty, 0, 0, 1];
}

export interface ResizedSize {
  readonly width: number;
  readonly height: number;
}

/** Downscale target keeping aspect; never upscales. */
export function fitWithin(width: number, height: number, maxSide: number): ResizedSize {
  const k = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
