import { describe, expect, it } from 'vitest';
import {
  applyMat3,
  computeAlignment,
  fitAffine,
  fitHomography,
  fitSimilarity,
  fitWithin,
  multiplyMat3,
  toCssMatrix3d,
  userAdjustMatrix,
  type Mat3,
  type Pt,
} from '@/modules/project-workspace/domain/infra-overlay-geometry';

/** Deterministic PRNG so the noise test is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());
}

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

describe('infra overlay geometry', () => {
  it('similarity recovers an exact similarity from 2, 3 and 4 points', () => {
    for (const n of [2, 3, 4]) {
      const dst = LANDMARKS.slice(0, n).map((p) => applyMat3(SIM, p));
      const fit = fitSimilarity(LANDMARKS.slice(0, n), dst)!;
      expect(fit.rms).toBeLessThan(1e-6);
      const probe = applyMat3(fit.matrix, { x: 600, y: 450 });
      const truth = applyMat3(SIM, { x: 600, y: 450 });
      expect(Math.hypot(probe.x - truth.x, probe.y - truth.y)).toBeLessThan(1e-6);
    }
  });

  it('affine and homography are exact through their defining points', () => {
    const H4: Mat3 = [0.5, 0.05, 90, -0.04, 0.48, 70, 0.00004, -0.00002, 1];
    const dst = LANDMARKS.map((p) => applyMat3(H4, p));
    expect(fitHomography(LANDMARKS, dst)!.rms).toBeLessThan(1e-6);
    expect(fitAffine(LANDMARKS, dst)!.rms).toBeLessThan(1e-6);
  });

  it('degenerate input (identical points) yields null', () => {
    expect(fitSimilarity([{ x: 5, y: 5 }, { x: 5, y: 5 }], [{ x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull();
    expect(fitSimilarity([{ x: 5, y: 5 }], [{ x: 1, y: 1 }])).toBeNull();
  });

  it('with finger-tap noise, similarity places hidden targets far better than an exact homography', () => {
    const r = rng(7);
    // Hidden targets (e.g. pipes) spread over the wall, not among the landmarks.
    const targets: Pt[] = [
      { x: 300, y: 450 },
      { x: 600, y: 300 },
      { x: 900, y: 500 },
      { x: 500, y: 650 },
    ];
    const SIGMA = 7; // screen px of tap error
    let simErr = 0;
    let homErr = 0;
    const trials = 300;
    for (let t = 0; t < trials; t += 1) {
      const dst = LANDMARKS.map((p) => {
        const q = applyMat3(SIM, p);
        return { x: q.x + gauss(r) * SIGMA, y: q.y + gauss(r) * SIGMA };
      });
      const sim = fitSimilarity(LANDMARKS, dst)!;
      const hom = fitHomography(LANDMARKS, dst)!;
      for (const target of targets) {
        const truth = applyMat3(SIM, target);
        const a = applyMat3(sim.matrix, target);
        const b = applyMat3(hom.matrix, target);
        simErr += Math.hypot(a.x - truth.x, a.y - truth.y);
        homErr += Math.hypot(b.x - truth.x, b.y - truth.y);
      }
    }
    const n = trials * targets.length;
    const meanSim = simErr / n;
    const meanHom = homErr / n;
    expect(meanSim).toBeLessThan(SIGMA); // averaging beats a single tap
    expect(meanSim).toBeLessThan(meanHom);
  });

  it('computeAlignment defaults to similarity and falls back when the warp is implausible', () => {
    const dst = LANDMARKS.map((p) => applyMat3(SIM, p));
    const asked = computeAlignment({
      photo: LANDMARKS,
      live: dst,
      photoW: W,
      photoH: H,
      perspective: true,
    })!;
    expect(asked.perspectiveRejected).toBe(false);
    expect(asked.fit.rms).toBeLessThan(1e-6);

    // Violent tap error on one corner -> skewed quad -> must be rejected.
    const bad = dst.map((p, i) => (i === 2 ? { x: p.x + 160, y: p.y - 140 } : p));
    const res = computeAlignment({
      photo: LANDMARKS,
      live: bad,
      photoW: W,
      photoH: H,
      perspective: true,
    })!;
    expect(res.perspectiveRejected).toBe(true);
    expect(res.fit.kind).toBe('similarity');

    const plain = computeAlignment({
      photo: LANDMARKS,
      live: bad,
      photoW: W,
      photoH: H,
      perspective: false,
    })!;
    expect(plain.fit.kind).toBe('similarity');
    expect(plain.perspectiveRejected).toBe(false);
  });

  it('needs at least two landmark pairs', () => {
    expect(
      computeAlignment({ photo: [LANDMARKS[0]!], live: [LANDMARKS[0]!], photoW: W, photoH: H, perspective: false }),
    ).toBeNull();
  });

  it('user adjustment rotates/scales about the pivot and translates', () => {
    const pivot = { x: 100, y: 100 };
    const m = userAdjustMatrix(pivot, { tx: 10, ty: -5, scale: 2, rotation: Math.PI / 2 });
    const p = applyMat3(m, { x: 110, y: 100 }); // offset (10,0) -> rotate 90deg, x2 -> (0,20)
    expect(p.x).toBeCloseTo(100 + 10, 6);
    expect(p.y).toBeCloseTo(100 + 20 - 5, 6);
    const composed = multiplyMat3(m, SIM);
    expect(toCssMatrix3d(composed)).toMatch(/^matrix3d\((-?[\d.]+,){15}-?[\d.]+\)$/);
  });

  it('fitWithin downscales keeping aspect and never upscales', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});
