import { describe, expect, it } from 'vitest';
import {
  screenToWorld,
  worldToScreen,
  zoomAtScreenPoint,
} from '@/modules/external-storage/ui/cad/pf-cad/renderer/view-math';

describe('pf-cad view-math', () => {
  const viewport = { width: 800, height: 600 };
  const view = { panX: 10, panY: 20, zoom: 2 };

  it('screenToWorld inverts worldToScreen at viewport center', () => {
    const [sx, sy] = worldToScreen(10, 20, view, viewport);
    const [wx, wy] = screenToWorld(sx, sy, view, viewport);
    expect(wx).toBeCloseTo(10, 5);
    expect(wy).toBeCloseTo(20, 5);
  });

  it('zoomAtScreenPoint keeps world point under cursor fixed', () => {
    const sx = 120;
    const sy = 340;
    const [wx0, wy0] = screenToWorld(sx, sy, view, viewport);
    const next = zoomAtScreenPoint(view, viewport, sx, sy, 1.5);
    const [wx1, wy1] = screenToWorld(sx, sy, next, viewport);
    expect(wx1).toBeCloseTo(wx0, 4);
    expect(wy1).toBeCloseTo(wy0, 4);
    expect(next.zoom).toBeCloseTo(view.zoom * 1.5, 8);
  });
});
