import { describe, expect, it } from 'vitest';
import {
  IDENTITY,
  applyMat3,
  classifyAlignment,
  computeAlignment,
  isAffineMat3,
  nudgeAdjust,
  triangleAffine,
  warpTriangles,
  type Mat3,
  type Pt,
} from '@/modules/project-workspace/domain/infra-overlay-geometry';

const W = 1200;
const H = 900;
const SIM: Mat3 = (() => {
  const a = 0.52 * Math.cos(0.12);
  const b = 0.52 * Math.sin(0.12);
  return [a, -b, 140, b, a, 60, 0, 0, 1] as Mat3;
})();
const LANDMARKS: Pt[] = [
  { x: 150, y: 140 },
  { x: 1050, y: 160 },
  { x: 1020, y: 760 },
  { x: 180, y: 740 },
];

describe('fit status (simple, never centimetres)', () => {
  const dst = LANDMARKS.map((p) => applyMat3(SIM, p));
  const base = { photo: LANDMARKS, photoW: W, photoH: H, perspective: false };

  it('is good when the four taps agree with each other', () => {
    expect(classifyAlignment(computeAlignment({ ...base, live: dst }))).toBe('good');
  });

  it('needs a fix when the taps are noisy but still usable', () => {
    const noisy = dst.map((p, i) => (i === 1 ? { x: p.x + 45, y: p.y - 40 } : p));
    const result = computeAlignment({ ...base, live: noisy });
    expect(result).not.toBeNull();
    expect(classifyAlignment(result)).toBe('needsFix');
  });

  it('needs a fix when a requested perspective was rejected', () => {
    const result = computeAlignment({ ...base, live: dst, perspective: true })!;
    expect(classifyAlignment({ ...result, perspectiveRejected: true })).toBe('needsFix');
  });

  it('failed when there is no trustworthy fit', () => {
    expect(classifyAlignment(null)).toBe('failed');
    const bad = dst.map((p, i) => (i === 2 ? { x: p.x + 160, y: p.y - 140 } : p));
    expect(classifyAlignment(computeAlignment({ ...base, live: bad }))).toBe('failed');
  });
});

describe('small controlled corrections', () => {
  it('moves by whole steps', () => {
    const start = nudgeAdjust(IDENTITY, { dx: 2 }, 400, 800);
    const moved = nudgeAdjust(start, { dy: -2 }, 400, 800);
    const p = applyMat3(moved, { x: 100, y: 100 });
    expect(p.x).toBeCloseTo(102, 9);
    expect(p.y).toBeCloseTo(98, 9);
  });

  it('scales and rotates about the stage centre so the layer does not drift', () => {
    const centre = { x: 200, y: 400 };
    const grown = nudgeAdjust(IDENTITY, { scale: 1.1 }, 400, 800);
    const turned = nudgeAdjust(IDENTITY, { rotation: 0.2 }, 400, 800);
    for (const m of [grown, turned]) {
      const p = applyMat3(m, centre);
      expect(p.x).toBeCloseTo(centre.x, 9);
      expect(p.y).toBeCloseTo(centre.y, 9);
    }
  });

  it('refuses to accumulate an absurd total scale', () => {
    let m: Mat3 = IDENTITY;
    for (let i = 0; i < 500; i += 1) m = nudgeAdjust(m, { scale: 1.05 }, 400, 800);
    expect(Math.hypot(m[0], m[3])).toBeLessThanOrEqual(1.5 + 1e-9);
  });
});

describe('canvas perspective (screen, broadcast and saved picture agree)', () => {
  const PERSPECTIVE: Mat3 = [0.5, 0.01, 90, -0.01, 0.5, 70, 0.00002, 0.00001, 1];

  it('tells affine from perspective matrices', () => {
    expect(isAffineMat3(SIM)).toBe(true);
    expect(isAffineMat3(PERSPECTIVE)).toBe(false);
  });

  it('the triangle mesh reproduces the homography at every vertex and stays close in between', () => {
    const triangles = warpTriangles(PERSPECTIVE, W, H, 8);
    expect(triangles).toHaveLength(8 * 8 * 2);
    let worst = 0;
    for (const t of triangles) {
      const affine = triangleAffine(t.src, t.dst)!;
      expect(affine).not.toBeNull();
      t.src.forEach((corner, i) => {
        const q = applyMat3(affine, corner);
        expect(Math.hypot(q.x - t.dst[i]!.x, q.y - t.dst[i]!.y)).toBeLessThan(1e-6);
      });
      const cx = (t.src[0].x + t.src[1].x + t.src[2].x) / 3;
      const cy = (t.src[0].y + t.src[1].y + t.src[2].y) / 3;
      const exact = applyMat3(PERSPECTIVE, { x: cx, y: cy });
      const approx = applyMat3(affine, { x: cx, y: cy });
      worst = Math.max(worst, Math.hypot(exact.x - approx.x, exact.y - approx.y));
    }
    expect(worst).toBeLessThan(0.5); // under half a pixel: indistinguishable from the on-screen layer
  });
});
