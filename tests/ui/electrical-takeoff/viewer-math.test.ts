import { describe, expect, it } from 'vitest';
import {
  clampScale,
  fitSelection,
  fitToRect,
  screenToPlan,
  wheelZoomsPlan,
  zoomAtPoint,
} from '@/modules/electrical-takeoff/ui/viewer/viewer-math';

describe('takeoff viewer-math', () => {
  it('clamps zoom scale', () => {
    expect(clampScale(0.001)).toBeGreaterThan(0);
    expect(clampScale(999)).toBeLessThan(999);
  });

  it('zooms around anchor', () => {
    const v = { scale: 1, offsetX: 0, offsetY: 0 };
    const next = zoomAtPoint(v, 2, 100, 100);
    expect(next.scale).toBeGreaterThan(v.scale);
  });

  it('maps screen to plan coords', () => {
    const rect = { left: 10, top: 20, width: 400, height: 300 } as DOMRect;
    const pt = screenToPlan(110, 120, rect, { scale: 2, offsetX: 0, offsetY: 0 });
    expect(pt.x).toBe(50);
    expect(pt.y).toBe(50);
  });

  it('fits content in view', () => {
    const v = fitToRect({ width: 800, height: 600 }, { width: 400, height: 200 });
    expect(v.scale).toBeGreaterThan(0);
    expect(v.offsetX).toBeGreaterThan(0);
  });

  it('zooms the plan only with Ctrl or Cmd', () => {
    expect(wheelZoomsPlan({ ctrlKey: false, metaKey: false })).toBe(false);
    expect(wheelZoomsPlan({ ctrlKey: true, metaKey: false })).toBe(true);
    expect(wheelZoomsPlan({ ctrlKey: false, metaKey: true })).toBe(true);
  });

  it('fits selection to center', () => {
    const v = fitSelection({ width: 500, height: 400 }, { x: 200, y: 100, width: 40, height: 40 });
    expect(v.scale).toBeGreaterThan(0);
  });
});