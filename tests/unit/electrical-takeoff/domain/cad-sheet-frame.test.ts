import { describe, expect, it } from 'vitest';
import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
import {
  chooseCadSheetFrame,
  modelToWorld,
  paperRects,
  segmentNear,
  solveModelWindow,
  textMatchesSheet,
  tightSymbolHalf,
} from '@/modules/electrical-takeoff/domain/cad-sheet-frame';
import type { WorkerDetection } from '@/modules/electrical-takeoff/domain/contracts';

const WINDOW = { cx: 1842.45, cy: 851.6, hw: 1578.6, hh: 1018.5 };
const SHEET = { width: 6000, height: 3871 };

const SAMPLES = [
  { nativeX: 2842.33, nativeY: 867.45, previewX: 4900.19, previewY: 1905.38 },
  { nativeX: 2499.32, nativeY: 374.24, previewX: 4248.33, previewY: 2842.65 },
  { nativeX: 1561.76, nativeY: 635.29, previewX: 2466.57, previewY: 2346.56 },
  { nativeX: 1012.45, nativeY: 147.08, previewX: 1422.65, previewY: 3274.33 },
  { nativeX: 2204.81, nativeY: 248.29, previewX: 3688.64, previewY: 3082.0 },
];

function rectSegments(x: number, y: number, width: number, height: number): Float32Array {
  const x0 = x - width / 2;
  const x1 = x + width / 2;
  const y0 = y - height / 2;
  const y1 = y + height / 2;
  const edge = (ax: number, ay: number, bx: number, by: number) => [ax, ay, bx, by, 0, 0, 0, 0];
  return new Float32Array([
    ...edge(x0, y0, x1, y0),
    ...edge(x0, y1, x1, y1),
    ...edge(x0, y0, x0, y1),
    ...edge(x1, y0, x1, y1),
  ]);
}

describe('cad sheet frame', () => {
  it('recovers the model window from preview pixels and native coordinates', () => {
    const window = solveModelWindow(SAMPLES, SHEET.width, SHEET.height);
    expect(window).not.toBeNull();
    expect(window?.cx).toBeCloseTo(WINDOW.cx, 0);
    expect(window?.cy).toBeCloseTo(WINDOW.cy, 0);
    expect(window?.hw).toBeCloseTo(WINDOW.hw, 0);
    expect(window?.hh).toBeCloseTo(WINDOW.hh, 0);
  });

  it('matches sheet 101 to the paper space whose title contains that name', () => {
    const scale = 407.4 / (2 * WINDOW.hh);
    const paper = { centerX: 158.9, centerY: -216.7, width: 631.4, height: 407.4 };
    const border = rectSegments(paper.centerX, paper.centerY, paper.width, paper.height);
    const placed = [SAMPLES[0]!, SAMPLES[1]!].map((sample) =>
      modelToWorld(sample.nativeX, sample.nativeY, {
        originX: 0,
        originY: 0,
        window: WINDOW,
        paper,
        scale,
      }),
    );
    const symbol = placed[0]!;
    const cluster = placed.flatMap((point) =>
      Array.from({ length: 8 }, (_, index) => [point.x, point.y, point.x + 0.4, point.y + index * 0.2, 0, 0, 0, 0]),
    );
    const segments = new Float32Array(border.length + cluster.length * 8);
    segments.set(border);
    cluster.forEach((edge, index) => {
      segments.set(edge, border.length + index * 8);
    });
    const frame = chooseCadSheetFrame({
      sheetKey: 'layout:101',
      sheetName: '101',
      kind: 'dwg_layout',
      widthPx: SHEET.width,
      heightPx: SHEET.height,
      samples: SAMPLES,
      marks: SAMPLES.map((sample, index) => ({ id: `l39-${index}`, nativeX: sample.nativeX, nativeY: sample.nativeY })),
      spaces: [
        {
          space: '*Model_Space',
          origin: [2237.83, 3925.35],
          segments: new Float32Array(8),
          texts: [],
        },
        {
          space: '*Paper_Space',
          origin: [272.86, 428.06],
          segments,
          texts: ['A-101'],
        },
      ],
    });
    expect(frame?.space).toBe('*Paper_Space');
    expect(frame?.marks[0]?.x).toBeCloseTo(symbol.x, 1);
    expect(frame?.marks[0]?.y).toBeCloseTo(symbol.y, 1);
    expect(textMatchesSheet(['A-101'], ['101'])).toBe(true);
    expect(segmentNear(segments, symbol.x, symbol.y, 2)).toBe(true);
    expect(paperRects(segments).length).toBeGreaterThan(0);
    expect(frame?.marks[0]?.half).toBeLessThan(8);
  });

  it('frames one symbol and leaves the next symbol outside the box', () => {
    const first = rectSegments(0, 0, 40, 30);
    const second = rectSegments(800, 0, 40, 30);
    const wall = new Float32Array([0, -20, 2000, -20, 0, 0, 0, 0]);
    const segments = new Float32Array(first.length + second.length + wall.length);
    segments.set(first);
    segments.set(second, first.length);
    segments.set(wall, first.length + second.length);
    const half = tightSymbolHalf(segments, 0, 0, 5000);
    expect(half).toBeGreaterThan(10);
    expect(half).toBeLessThan(80);
  });

  it('keeps the frame on the electrical symbol when architectural ink surrounds it', () => {
    const parts = [rectSegments(0, 0, 16, 16)];
    let size = 20;
    while (size < 400) {
      const square = rectSegments(0, 0, size, size);
      for (let i = 5; i < square.length; i += 8) square[i] = 4;
      parts.push(square);
      size = Math.round(size * 1.2);
    }
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const segments = new Float32Array(length);
    let offset = 0;
    for (const part of parts) {
      segments.set(part, offset);
      offset += part.length;
    }
    const withWalls = tightSymbolHalf(segments, 0, 0, 500);
    const symbolOnly = tightSymbolHalf(segments, 0, 0, 500, new Set([4]));
    expect(symbolOnly).toBeLessThan(withWalls);
    expect(symbolOnly).toBeLessThan(20);
  });

  it('keeps native coordinates until the mark is moved', () => {
    const base = [
      {
        id: 'a',
        sheetKey: 'layout:101',
        fileId: 'f',
        source: 'dwg',
        x: 1,
        y: 2,
        w: 12,
        h: 12,
        signature: 'block:l39',
        signatureKind: 'dwg-block',
        rawClass: 'l39',
        typeKey: null,
        classifiedBy: 'none',
        confidence: 'none',
        reasons: ['unclassified'],
        native: { x: 10, y: 20 },
      },
    ] as WorkerDetection[];
    expect(applyEdits(base, [])[0]?.native).toEqual({ x: 10, y: 20 });
    expect(applyEdits(base, [{ op: 'move', detectionId: 'a', x: 3, y: 4 }])[0]?.native).toBeUndefined();
  });
});
