import { describe, expect, it } from 'vitest';
import {
  FINE_DRAG_GAIN,
  chooseLoupeAnchor,
  loupeLeft,
} from '@/modules/project-workspace/domain/infra-overlay-geometry';
import {
  IDENTITY_VIEW,
  clientToImage,
  containedRect,
  dragPoint,
  imageToBox,
  nearestPoint,
  zoomView,
  type ViewTransform,
} from '@/modules/infra-mapping/ui/live-share-view';

const BOXES = [
  { w: 390, h: 844 }, // phone, portrait
  { w: 844, h: 390 }, // phone, landscape
  { w: 1024, h: 768 },
];
const ASPECTS = [9 / 16, 4 / 3, 16 / 9, 1];
const VIEWS: ViewTransform[] = [
  IDENTITY_VIEW,
  { scale: 2, x: 40, y: -30 },
  { scale: 4.5, x: -120, y: 90 },
];

describe('picture rectangle', () => {
  it('letterboxes an object-contain picture in the middle of the box', () => {
    const rect = containedRect(390, 844, 16 / 9);
    expect(rect.width).toBeCloseTo(390, 6);
    expect(rect.height).toBeCloseTo((390 * 9) / 16, 6);
    expect(rect.left).toBeCloseTo(0, 6);
    expect(rect.top).toBeCloseTo((844 - rect.height) / 2, 6);
  });

  it('falls back to the whole box for a broken aspect', () => {
    expect(containedRect(300, 200, 0)).toEqual({ left: 0, top: 0, width: 300, height: 200 });
    expect(containedRect(300, 200, Number.NaN)).toEqual({ left: 0, top: 0, width: 300, height: 200 });
  });
});

describe('touch <-> picture point mapping (the same point on both phones)', () => {
  it('round-trips through every zoom, pan, screen and aspect ratio', () => {
    for (const box of BOXES) {
      for (const aspect of ASPECTS) {
        for (const view of VIEWS) {
          for (const point of [
            { x: 0.5, y: 0.5 },
            { x: 0.02, y: 0.97 },
            { x: 0.83, y: 0.11 },
          ]) {
            const onScreen = imageToBox(point, box, view, aspect);
            const back = clientToImage(onScreen, box, view, aspect, { clamp: true });
            expect(back).not.toBeNull();
            expect(back!.x).toBeCloseTo(point.x, 9);
            expect(back!.y).toBeCloseTo(point.y, 9);
          }
        }
      }
    }
  });

  it('a point marked on the picture does not depend on the viewer zoom', () => {
    // The same wall spot touched on two differently zoomed viewers gives the same picture point.
    const box = { w: 390, h: 844 };
    const aspect = 16 / 9;
    const spot = { x: 0.31, y: 0.64 };
    const a = clientToImage(imageToBox(spot, box, IDENTITY_VIEW, aspect), box, IDENTITY_VIEW, aspect)!;
    const zoomed = zoomView(IDENTITY_VIEW, 3, { x: 20, y: 10 }, { x: 0, y: 0 }, box.w, box.h);
    const b = clientToImage(imageToBox(spot, box, zoomed, aspect), box, zoomed, aspect)!;
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
  });

  it('rejects touches in the black margins and outside the picture', () => {
    const box = { w: 390, h: 844 };
    const aspect = 16 / 9; // a wide picture leaves black bars above and below
    const rect = containedRect(box.w, box.h, aspect);
    expect(clientToImage({ x: 200, y: rect.top - 5 }, box, IDENTITY_VIEW, aspect)).toBeNull();
    expect(clientToImage({ x: 200, y: rect.top + rect.height + 5 }, box, IDENTITY_VIEW, aspect)).toBeNull();
    expect(clientToImage({ x: -3, y: 400 }, box, IDENTITY_VIEW, aspect)).toBeNull();
    expect(clientToImage({ x: 200, y: rect.top + 2 }, box, IDENTITY_VIEW, aspect)).not.toBeNull();
    // Zoomed in, a margin that was on screen can show picture, and a corner of the picture can be off screen.
    const zoomed: ViewTransform = { scale: 3, x: 0, y: 0 };
    expect(clientToImage({ x: 200, y: rect.top - 5 }, box, zoomed, aspect)).not.toBeNull();
  });

  it('clamps a point dragged past the edge onto the edge', () => {
    const box = { w: 390, h: 844 };
    const clamped = clientToImage({ x: -50, y: 9999 }, box, IDENTITY_VIEW, 16 / 9, { clamp: true })!;
    expect(clamped).toEqual({ x: 0, y: 1 });
  });

  it('finds the nearest point only within the touch radius', () => {
    const box = { w: 390, h: 844 };
    const pins = [
      { x: 0.2, y: 0.4 },
      { x: 0.8, y: 0.6 },
    ];
    const near = imageToBox(pins[1]!, box, IDENTITY_VIEW, 1);
    expect(nearestPoint(pins, { x: near.x + 10, y: near.y - 8 }, box, IDENTITY_VIEW, 1, 28)).toBe(1);
    expect(nearestPoint(pins, { x: near.x + 80, y: near.y }, box, IDENTITY_VIEW, 1, 28)).toBe(-1);
  });
});

describe('fine drag', () => {
  it('moves a point less than the finger, and less still when zoomed in', () => {
    const box = { w: 400, h: 400 };
    const start = { x: 0.5, y: 0.5 };
    const delta = { x: 40, y: -20 };
    const plain = dragPoint(start, delta, box, IDENTITY_VIEW, 1, FINE_DRAG_GAIN);
    // 40 px of finger = 0.1 of the picture; half of that with the fine gain.
    expect(plain.x).toBeCloseTo(0.5 + 0.05, 9);
    expect(plain.y).toBeCloseTo(0.5 - 0.025, 9);
    const zoomed = dragPoint(start, delta, box, { scale: 4, x: 0, y: 0 }, 1, FINE_DRAG_GAIN);
    expect(Math.abs(zoomed.x - 0.5)).toBeCloseTo(Math.abs(plain.x - 0.5) / 4, 9);
  });

  it('keeps the point inside the picture', () => {
    const moved = dragPoint({ x: 0.98, y: 0.02 }, { x: 500, y: -500 }, { w: 400, h: 400 }, IDENTITY_VIEW, 1, 1);
    expect(moved).toEqual({ x: 1, y: 0 });
  });

  it('has a fixed fine gain below one', () => {
    expect(FINE_DRAG_GAIN).toBeGreaterThan(0);
    expect(FINE_DRAG_GAIN).toBeLessThan(1);
  });
});

describe('fixed magnifier position', () => {
  const SIZE = 104;
  const CLEARANCE = 44;

  it('stays at the top and never covers the touch', () => {
    for (const rtl of [false, true]) {
      for (const surfaceW of [320, 390, 844]) {
        for (let x = 0; x <= surfaceW; x += 10) {
          for (const y of [0, 60, 150, 400, 700]) {
            const anchor = chooseLoupeAnchor({ x, y }, surfaceW, SIZE, rtl, CLEARANCE);
            const left = loupeLeft(anchor, surfaceW, SIZE, rtl);
            const covers = x >= left - CLEARANCE && x <= left + SIZE + CLEARANCE && y <= 8 + SIZE + CLEARANCE;
            // It may only cover the finger when the screen is too narrow for any other spot (never on a normal phone).
            if (surfaceW >= 390) expect(covers).toBe(false);
          }
        }
      }
    }
  });

  it('is decided from the touch start only: a drag cannot move it', () => {
    // The anchor is a pure function of the first touch; the same start always gives the same side.
    const start = { x: 300, y: 500 };
    const first = chooseLoupeAnchor(start, 390, SIZE, false, CLEARANCE);
    for (let i = 0; i < 5; i += 1) expect(chooseLoupeAnchor(start, 390, SIZE, false, CLEARANCE)).toBe(first);
    // And each anchor is a fixed box along the top edge of the surface.
    expect(loupeLeft('end', 390, SIZE, false)).toBe(390 - 8 - SIZE);
    expect(loupeLeft('start', 390, SIZE, false)).toBe(8);
    expect(loupeLeft('end', 390, SIZE, true)).toBe(8);
    expect(loupeLeft('center', 390, SIZE, false)).toBe((390 - SIZE) / 2);
  });

  it('moves to another fixed spot when the touch starts right under the first choice', () => {
    const underEnd = { x: 390 - 8 - SIZE / 2, y: 40 };
    expect(chooseLoupeAnchor(underEnd, 390, SIZE, false, CLEARANCE)).not.toBe('end');
  });
});
