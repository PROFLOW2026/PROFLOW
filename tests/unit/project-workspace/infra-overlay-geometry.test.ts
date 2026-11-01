import { describe, expect, it } from 'vitest';
import {
  applyMat3,
  computeAlignment,
  computeStageAlignment,
  fitContain,
  invertMat3,
  fitAffine,
  fitHomography,
  fitSimilarity,
  fitWithin,
  isPlausibleWarp,
  landmarksAreSpread,
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

  it('computeAlignment gives a stable similarity fit and ignores perspective unless asked', () => {
    const dst = LANDMARKS.map((p) => applyMat3(SIM, p));
    const plain = computeAlignment({ photo: LANDMARKS, live: dst, photoW: W, photoH: H, perspective: false })!;
    expect(plain.fit.kind).toBe('similarity');
    expect(plain.fit.rms).toBeLessThan(1e-6);
    const asked = computeAlignment({ photo: LANDMARKS, live: dst, photoW: W, photoH: H, perspective: true })!;
    expect(asked.perspectiveRejected).toBe(false);
  });

  it('refuses to present an unreliable fit (bad taps) instead of showing a distorted layer', () => {
    const dst = LANDMARKS.map((p) => applyMat3(SIM, p));
    const bad = dst.map((p, i) => (i === 2 ? { x: p.x + 160, y: p.y - 140 } : p));
    expect(computeAlignment({ photo: LANDMARKS, live: bad, photoW: W, photoH: H, perspective: false })).toBeNull();
    expect(computeAlignment({ photo: LANDMARKS, live: bad, photoW: W, photoH: H, perspective: true })).toBeNull();
  });

  it('refuses an abnormal rotation', () => {
    const a = (50 * Math.PI) / 180;
    const rot: Mat3 = [0.5 * Math.cos(a), -0.5 * Math.sin(a), 300, 0.5 * Math.sin(a), 0.5 * Math.cos(a), 100, 0, 0, 1];
    const live = LANDMARKS.map((p) => applyMat3(rot, p));
    expect(computeAlignment({ photo: LANDMARKS, live, photoW: W, photoH: H, perspective: false })).toBeNull();
  });

  it('rejects an implausible warp but keeps a plausible one', () => {
    const skew: Mat3 = [0.5, 0, 0, 0, 0.5, 0, 0.0016, 0, 1];
    expect(isPlausibleWarp(skew, W, H, SIM)).toBe(false);
    const mild: Mat3 = [0.5, 0.01, 90, -0.01, 0.5, 70, 0.00002, 0, 1];
    expect(isPlausibleWarp(mild, W, H, SIM)).toBe(true);
  });

  it('requires four landmarks that are spread over the surface', () => {
    const spread = [{ x: 0.1, y: 0.15 }, { x: 0.9, y: 0.2 }, { x: 0.85, y: 0.85 }, { x: 0.15, y: 0.8 }];
    expect(landmarksAreSpread(spread)).toBe(true);
    expect(landmarksAreSpread(spread.slice(0, 3))).toBe(false);
    const bunched = [{ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.42 }, { x: 0.47, y: 0.52 }, { x: 0.41, y: 0.5 }];
    expect(landmarksAreSpread(bunched)).toBe(false);
    const line = [{ x: 0.1, y: 0.5 }, { x: 0.4, y: 0.5 }, { x: 0.7, y: 0.5 }, { x: 0.9, y: 0.5 }];
    expect(landmarksAreSpread(line)).toBe(false);
  });
  it('invertMat3 and fitContain keep aspect ratio and round-trip', () => {
    const m = fitContain(1900, 900, 390, 844);
    expect(m[0]).toBeCloseTo(m[4], 9);
    const p = applyMat3(m, { x: 950, y: 450 });
    expect(p.x).toBeCloseTo(195, 6);
    expect(p.y).toBeCloseTo(422, 6);
    const back = applyMat3(invertMat3(m), p);
    expect(back.x).toBeCloseTo(950, 6);
    expect(back.y).toBeCloseTo(450, 6);
  });

  it('shared engine aligns a photo to a different-resolution, different-aspect target photo', () => {
    // the 1200x900 "before" wall appears in a 1900x900 "after" photo, shown contain-fit on a 390x844 stage
    const afterM: Mat3 = [0.62, 0, 300, 0, 0.62, 40, 0, 0, 1];
    const contain = fitContain(1900, 900, 390, 844);
    const before = LANDMARKS.map((p) => ({ x: p.x / W, y: p.y / H }));
    const targetPx = LANDMARKS.map((p) => applyMat3(contain, applyMat3(afterM, p)));
    const res = computeStageAlignment({
      photoW: W,
      photoH: H,
      photoPins: before,
      targetPx,
      stageW: 390,
      stageH: 844,
      perspective: false,
      checkSpreadOnStage: false,
    })!;
    expect(res.fit.rms).toBeLessThan(1e-6);
    const probe = applyMat3(res.fit.matrix, { x: 600, y: 450 });
    const truth = applyMat3(contain, applyMat3(afterM, { x: 600, y: 450 }));
    expect(Math.hypot(probe.x - truth.x, probe.y - truth.y)).toBeLessThan(1e-6);
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
