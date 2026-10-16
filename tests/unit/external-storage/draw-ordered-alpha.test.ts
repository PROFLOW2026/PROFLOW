import { describe, expect, it } from 'vitest';
import { buildOrderedDrawBatches } from '@/modules/external-storage/ui/cad/pf-cad/renderer/draw-ordered-batches';
import { SEGMENT_STRIDE, TRIANGLE_STRIDE } from '@/modules/external-storage/ui/cad/pf-cad/renderer/segment-format';

function packColor(r: number, g: number, b: number, a = 255): number {
  return ((a & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function f32Bits(u: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, u, true);
  return view.getFloat32(0, true);
}

describe('draw-ordered-batches alpha sort', () => {
  it('draws opaque fills before transparent at same SORTENTS order', () => {
    const segments = new Float32Array(0);
    const tris = new Float32Array(TRIANGLE_STRIDE * 2);
    const order = 5;
    const opaque = packColor(10, 20, 30, 255);
    const transparent = packColor(10, 20, 30, 128);
    for (let i = 0; i < 2; i += 1) {
      const base = i * TRIANGLE_STRIDE;
      const color = i === 0 ? transparent : opaque;
      tris[base] = 0;
      tris[base + 1] = 0;
      tris[base + 2] = 1;
      tris[base + 3] = 0;
      tris[base + 4] = 0;
      tris[base + 5] = 1;
      tris[base + 6] = f32Bits(color);
      tris[base + 7] = 0;
      tris[base + 8] = 25;
      tris[base + 9] = order;
    }
    const batches = buildOrderedDrawBatches(segments, tris, { mode: 'all' }, SEGMENT_STRIDE);
    expect(batches.length).toBe(2);
    expect(batches[0]!.colorBits >>> 0).toBe(opaque >>> 0);
    expect(batches[1]!.colorBits >>> 0).toBe(transparent >>> 0);
  });
});
