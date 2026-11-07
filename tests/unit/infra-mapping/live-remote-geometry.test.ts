import { describe, expect, it } from 'vitest';
import {
  FINE_DRAG_GAIN,
  LOUPE_BOTTOM_CLEARANCE_PX,
  LOUPE_EDGE_PX,
  bottomLoupePlacement,
  clampLoupePlacement,
  defaultLoupeLeft,
  dragLoupePlacement,
  toggleLoupePlacement,
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

describe('magnifier placement', () => {
  const SIZE = 104;
  const W = 390;
  const H = 844;

  it('defaults to the top centre, never a corner', () => {
    for (const w of [320, 390, 844, 1024]) {
      const left = defaultLoupeLeft(w, SIZE);
      expect(left).toBe((w - SIZE) / 2);
      // Equal room on both sides: not left, not right.
      expect(left).toBe(w - SIZE - left);
    }
  });

  it('moving the frame follows the dragging finger and stays inside the surface', () => {
    const start = { left: defaultLoupeLeft(W, SIZE), top: 8 };
    expect(dragLoupePlacement(start, 30, 200, W, H, SIZE)).toEqual({ left: start.left + 30, top: 208 });
    const far = dragLoupePlacement(start, 5000, 5000, W, H, SIZE);
    expect(far).toEqual({ left: W - SIZE - LOUPE_EDGE_PX, top: H - SIZE - LOUPE_EDGE_PX });
    const near = dragLoupePlacement(start, -5000, -5000, W, H, SIZE);
    expect(near).toEqual({ left: LOUPE_EDGE_PX, top: LOUPE_EDGE_PX });
  });

  it('keeps a stored placement valid when the surface shrinks', () => {
    const shrunk = clampLoupePlacement({ left: 300, top: 700 }, 320, 600, SIZE);
    expect(shrunk.left + SIZE).toBeLessThanOrEqual(320);
    expect(shrunk.top + SIZE).toBeLessThanOrEqual(600);
  });

  it('hops between top centre and bottom centre, above the action bar', () => {
    const bottom = bottomLoupePlacement(W, H, SIZE);
    expect(bottom.left).toBe(defaultLoupeLeft(W, SIZE));
    expect(bottom.top).toBe(H - SIZE - LOUPE_BOTTOM_CLEARANCE_PX);
    // From the top: to the bottom. From the lower half: back to the default (null).
    expect(toggleLoupePlacement(8, W, H, SIZE)).toEqual(bottom);
    expect(toggleLoupePlacement(bottom.top, W, H, SIZE)).toBeNull();
  });
});
