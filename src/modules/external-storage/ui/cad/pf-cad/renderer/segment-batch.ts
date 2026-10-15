import {
  SEGMENT_STRIDE,
  colorBitsFromSegmentFloat,
  layerIndexFromSegment,
  segmentCount,
} from './segment-format';
import { isLayerVisible, type LayerVisibilityState } from './layer-visibility';
import { yieldToMain } from '../yield-to-main';

/** GPU line batch: contiguous vec2 positions for GL.LINES (pairs of endpoints). */
export type ColorLineBatch = {
  colorBits: number;
  /** Pairs of x,y per vertex; length is multiple of 4. */
  positions: Float32Array;
  vertexCount: number;
};

export type SegmentBatchResult = {
  batches: ColorLineBatch[];
  drawnSegments: number;
  skippedByLayer: number;
};

const SEGMENTS_PER_YIELD = 40_000;

/**
 * Group visible segments by packed color for fewer uniform changes.
 * Positions are copied as-is (RTC world coords).
 */
export function buildColorLineBatches(
  segments: Float32Array,
  visibility: LayerVisibilityState,
): SegmentBatchResult {
  const n = segmentCount(segments);
  const floatCounts = new Map<number, number>();
  let skippedByLayer = 0;

  for (let i = 0; i < n; i += 1) {
    const base = i * SEGMENT_STRIDE;
    const layer = layerIndexFromSegment(segments[base + 5]!);
    if (!isLayerVisible(visibility, layer)) {
      skippedByLayer += 1;
      continue;
    }
    const colorBits = colorBitsFromSegmentFloat(segments[base + 4]!);
    floatCounts.set(colorBits, (floatCounts.get(colorBits) ?? 0) + 4);
  }

  const writers = new Map<number, { positions: Float32Array; offset: number }>();
  for (const [colorBits, len] of floatCounts) {
    writers.set(colorBits, { positions: new Float32Array(len), offset: 0 });
  }

  let drawnSegments = 0;
  for (let i = 0; i < n; i += 1) {
    const base = i * SEGMENT_STRIDE;
    const layer = layerIndexFromSegment(segments[base + 5]!);
    if (!isLayerVisible(visibility, layer)) {
      continue;
    }
    const colorBits = colorBitsFromSegmentFloat(segments[base + 4]!);
    const w = writers.get(colorBits)!;
    const o = w.offset;
    w.positions[o] = segments[base]!;
    w.positions[o + 1] = segments[base + 1]!;
    w.positions[o + 2] = segments[base + 2]!;
    w.positions[o + 3] = segments[base + 3]!;
    w.offset = o + 4;
    drawnSegments += 1;
  }

  const batches: ColorLineBatch[] = [];
  for (const [colorBits, w] of writers) {
    const vertexCount = w.positions.length / 2;
    batches.push({ colorBits, positions: w.positions, vertexCount });
  }
  batches.sort((a, b) => a.colorBits - b.colorBits);
  return { batches, drawnSegments, skippedByLayer };
}

/** Same as {@link buildColorLineBatches} but yields during long scans to keep UI responsive. */
export async function buildColorLineBatchesAsync(
  segments: Float32Array,
  visibility: LayerVisibilityState,
): Promise<SegmentBatchResult> {
  const n = segmentCount(segments);
  if (n <= SEGMENTS_PER_YIELD) {
    return buildColorLineBatches(segments, visibility);
  }

  const floatCounts = new Map<number, number>();
  let skippedByLayer = 0;

  for (let start = 0; start < n; start += SEGMENTS_PER_YIELD) {
    const end = Math.min(n, start + SEGMENTS_PER_YIELD);
    for (let i = start; i < end; i += 1) {
      const base = i * SEGMENT_STRIDE;
      const layer = layerIndexFromSegment(segments[base + 5]!);
      if (!isLayerVisible(visibility, layer)) {
        skippedByLayer += 1;
        continue;
      }
      const colorBits = colorBitsFromSegmentFloat(segments[base + 4]!);
      floatCounts.set(colorBits, (floatCounts.get(colorBits) ?? 0) + 4);
    }
    await yieldToMain();
  }

  const writers = new Map<number, { positions: Float32Array; offset: number }>();
  for (const [colorBits, len] of floatCounts) {
    writers.set(colorBits, { positions: new Float32Array(len), offset: 0 });
  }

  let drawnSegments = 0;
  for (let start = 0; start < n; start += SEGMENTS_PER_YIELD) {
    const end = Math.min(n, start + SEGMENTS_PER_YIELD);
    for (let i = start; i < end; i += 1) {
      const base = i * SEGMENT_STRIDE;
      const layer = layerIndexFromSegment(segments[base + 5]!);
      if (!isLayerVisible(visibility, layer)) {
        continue;
      }
      const colorBits = colorBitsFromSegmentFloat(segments[base + 4]!);
      const w = writers.get(colorBits)!;
      const o = w.offset;
      w.positions[o] = segments[base]!;
      w.positions[o + 1] = segments[base + 1]!;
      w.positions[o + 2] = segments[base + 2]!;
      w.positions[o + 3] = segments[base + 3]!;
      w.offset = o + 4;
      drawnSegments += 1;
    }
    await yieldToMain();
  }

  const batches: ColorLineBatch[] = [];
  for (const [colorBits, w] of writers) {
    batches.push({
      colorBits,
      positions: w.positions,
      vertexCount: w.positions.length / 2,
    });
  }
  batches.sort((a, b) => a.colorBits - b.colorBits);
  return { batches, drawnSegments, skippedByLayer };
}
