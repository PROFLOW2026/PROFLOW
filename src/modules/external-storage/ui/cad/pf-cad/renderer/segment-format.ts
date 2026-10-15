/** Flat segment buffer stride from pf-cad-wasm / contracts. */
export const SEGMENT_STRIDE = 6;

export type CadExtent = readonly [number, number, number, number];

/** Number of line segments in a flat buffer. */
export function segmentCount(segments: Float32Array): number {
  if (segments.length % SEGMENT_STRIDE !== 0) {
    throw new Error(
      `segments.length ${segments.length} is not a multiple of stride ${SEGMENT_STRIDE}`,
    );
  }
  return segments.length / SEGMENT_STRIDE;
}

/** Read packed 0xRRGGBB color stored as f32 bit pattern (wasm `f32::from_bits`). */
export function colorBitsFromSegmentFloat(colorField: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, colorField, true);
  return view.getUint32(0, true);
}

/** Normalize layer index field (stored as f32). */
export function layerIndexFromSegment(layerField: number): number {
  return Math.trunc(layerField);
}

export function colorBitsToRgb01(colorBits: number): [number, number, number] {
  const r = ((colorBits >> 16) & 0xff) / 255;
  const g = ((colorBits >> 8) & 0xff) / 255;
  const b = (colorBits & 0xff) / 255;
  return [r, g, b];
}
