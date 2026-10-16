import { describe, expect, it } from 'vitest';
import { pointInPolygon } from '@/modules/external-storage/ui/cad/pf-cad/cad-raster-clip';

describe('cad-raster-clip', () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it('detects interior and exterior points', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(-1, 5, square)).toBe(false);
  });

  it('treats short polygons as unclipped', () => {
    expect(pointInPolygon(1, 1, [[0, 0], [1, 0]])).toBe(true);
  });
});
