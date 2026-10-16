/**
 * Expand line segments into triangle meshes; half-width is applied in the vertex shader via u_lineWidthPx (no zoom rebatch).
 * Interleaved vertex: p0(2), p1(2), atP1(1), side(1) = 6 floats per corner, 6 corners per segment.
 */
export type WideLineGpuBatch = {
  colorBits: number;
  lineWeightHundredths: number;
  /** 6 floats per vertex × 6 vertices per segment. */
  interleaved: Float32Array;
  vertexCount: number;
};

const CORNERS: readonly [number, number][] = [
  [0, -1],
  [0, 1],
  [1, 1],
  [0, -1],
  [1, 1],
  [1, -1],
];

export function appendSegmentWideLine(
  out: number[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  for (const [atP1, side] of CORNERS) {
    out.push(x1, y1, x2, y2, atP1, side);
  }
}

export function wideLineMeshFromPairs(pairs: Float32Array): Float32Array {
  const segCount = pairs.length / 4;
  const interleaved = new Float32Array(segCount * 6 * 6);
  let o = 0;
  for (let i = 0; i < segCount; i += 1) {
    const base = i * 4;
    const x1 = pairs[base]!;
    const y1 = pairs[base + 1]!;
    const x2 = pairs[base + 2]!;
    const y2 = pairs[base + 3]!;
    for (const [atP1, side] of CORNERS) {
      interleaved[o++] = x1;
      interleaved[o++] = y1;
      interleaved[o++] = x2;
      interleaved[o++] = y2;
      interleaved[o++] = atP1;
      interleaved[o++] = side;
    }
  }
  return interleaved;
}
