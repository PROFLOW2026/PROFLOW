/**
 * Canvas drawing shared by every place that must show the SAME aligned picture as the screen:
 * the saved result snapshot, the live broadcast and the frozen frame.
 *
 * On screen the "before" layer is a CSS `matrix3d` (full perspective). A 2D canvas only knows affine maps, so a
 * perspective matrix is drawn as a small triangle mesh with one exact affine map per triangle. That keeps the
 * broadcast / saved picture visually identical to what the person holding the phone sees.
 */

import {
  isAffineMat3,
  triangleAffine,
  warpTriangles,
  type Mat3,
  type Pt,
} from '../domain/infra-overlay-geometry';
import type { InfraLiveComposition } from './infra-trial-integration';

/** 8 x 8 cells (128 triangles) is visually exact for the mild, sanity-gated perspectives this tool allows. */
const WARP_DIVISIONS = 8;
/** Triangle edges are pushed out by this many device pixels so neighbours never leave a hairline seam. */
const SEAM_DEVICE_PX = 1.25;

let scratch: HTMLCanvasElement | null = null;

function scratchFor(width: number, height: number): CanvasRenderingContext2D | null {
  scratch ??= document.createElement('canvas');
  if (scratch.width !== width || scratch.height !== height) {
    scratch.width = width;
    scratch.height = height;
  }
  const sctx = scratch.getContext('2d');
  if (!sctx) return null;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, width, height);
  return sctx;
}

/** Distance from the centroid to the nearest edge of the triangle. */
function nearestEdgeDistance(points: readonly [Pt, Pt, Pt], cx: number, cy: number): number {
  let nearest = Infinity;
  for (let i = 0; i < 3; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % 3]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-9) return 0;
    nearest = Math.min(nearest, Math.abs((b.x - a.x) * (a.y - cy) - (a.x - cx) * (b.y - a.y)) / length);
  }
  return nearest;
}

/**
 * Grows a triangle about its centroid so that EVERY edge moves outwards by `seam` user units. Neighbouring
 * triangles then overlap by more than a device pixel and no hairline of the backdrop shows between them.
 */
function grownTriangle(points: readonly [Pt, Pt, Pt], seam: number): [Pt, Pt, Pt] {
  const cx = (points[0].x + points[1].x + points[2].x) / 3;
  const cy = (points[0].y + points[1].y + points[2].y) / 3;
  const inner = nearestEdgeDistance(points, cx, cy);
  const factor = inner > 1e-6 ? 1 + seam / inner : 1;
  const grow = (p: Pt): Pt => ({ x: cx + (p.x - cx) * factor, y: cy + (p.y - cy) * factor });
  return [grow(points[0]), grow(points[1]), grow(points[2])];
}

/**
 * Draws an image of `width` x `height` pixels through `matrix` (image pixels -> current canvas user space).
 * The caller's current transform (for example a resolution scale) is respected.
 */
export function drawThroughMatrix(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  matrix: Mat3,
  alpha: number,
): void {
  if (isAffineMat3(matrix)) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.transform(matrix[0], matrix[3], matrix[1], matrix[4], matrix[2], matrix[5]);
    ctx.drawImage(image, 0, 0, width, height);
    ctx.restore();
    return;
  }
  const canvas = ctx.canvas;
  const sctx = scratchFor(canvas.width, canvas.height);
  if (!sctx) return;
  const transform = ctx.getTransform();
  sctx.setTransform(transform);
  // The overlap is measured in device pixels, so it stays big enough at any resolution scale.
  const seam = SEAM_DEVICE_PX / Math.max(1e-6, Math.hypot(transform.a, transform.b));
  for (const triangle of warpTriangles(matrix, width, height, WARP_DIVISIONS)) {
    const affine = triangleAffine(triangle.src, triangle.dst);
    if (!affine) continue;
    const [a, b, c] = grownTriangle(triangle.dst, seam);
    sctx.save();
    sctx.beginPath();
    sctx.moveTo(a.x, a.y);
    sctx.lineTo(b.x, b.y);
    sctx.lineTo(c.x, c.y);
    sctx.closePath();
    sctx.clip();
    sctx.transform(affine[0], affine[3], affine[1], affine[4], affine[2], affine[5]);
    sctx.drawImage(image, 0, 0, width, height);
    sctx.restore();
  }
  // Composite once so the overlap between triangles does not double the transparency.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.drawImage(sctx.canvas, 0, 0);
  ctx.restore();
}

/** The camera frame, cropped exactly like the on-screen `object-cover` video. */
export function drawVideoCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, stageW: number, stageH: number): void {
  const cover = Math.max(stageW / video.videoWidth, stageH / video.videoHeight);
  const dw = video.videoWidth * cover;
  const dh = video.videoHeight * cover;
  ctx.drawImage(video, (stageW - dw) / 2, (stageH - dh) / 2, dw, dh);
}

/**
 * One composed frame (camera + transparent "before" layer) in stage coordinates. `overlayImage` must be a loaded
 * image of `composition.overlay.url`; when it is not ready only the camera is drawn.
 */
export function paintComposition(
  ctx: CanvasRenderingContext2D,
  composition: InfraLiveComposition,
  overlayImage: CanvasImageSource | null,
): void {
  drawVideoCover(ctx, composition.video, composition.stageW, composition.stageH);
  if (!composition.overlay || !composition.matrix || !overlayImage) return;
  drawThroughMatrix(
    ctx,
    overlayImage,
    composition.overlay.width,
    composition.overlay.height,
    composition.matrix,
    composition.opacity,
  );
}
