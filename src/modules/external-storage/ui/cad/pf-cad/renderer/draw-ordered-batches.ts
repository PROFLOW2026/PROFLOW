import {
  SEGMENT_STRIDE,
  TRIANGLE_STRIDE,
  colorBitsFromSegmentFloat,
  layerIndexFromSegment,
  lineWeightHundredthsFromSegment,
  segmentCount,
  triangleCount,
} from './segment-format';
import { isLayerVisible, type LayerVisibilityState } from './layer-visibility';
import { yieldToMain } from '../yield-to-main';

export type FillDrawBatch = {
  kind: 'fill';
  colorBits: number;
  positions: Float32Array;
  vertexCount: number;
};

export type LineDrawBatch = {
  kind: 'line';
  colorBits: number;
  lineWeightHundredths: number;
  /** Endpoint pairs (x1,y1,x2,y2) for wide-line mesh expansion at upload. */
  positions: Float32Array;
  vertexCount: number;
};

export type DrawBatch = FillDrawBatch | LineDrawBatch;

const SEGMENTS_PER_YIELD = 24_000;

type Prim =
  | { order: number; kind: 'line'; colorBits: number; lw: number; x1: number; y1: number; x2: number; y2: number }
  | {
      order: number;
      kind: 'fill';
      colorBits: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x3: number;
      y3: number;
    };

function collectPrims(
  segments: Float32Array,
  triangles: Float32Array,
  visibility: LayerVisibilityState,
  segStride: number,
): Prim[] {
  const prims: Prim[] = [];
  const nSeg = segmentCount(segments, segStride);
  for (let i = 0; i < nSeg; i += 1) {
    const base = i * segStride;
    const layer = layerIndexFromSegment(segments[base + 5]!);
    if (!isLayerVisible(visibility, layer)) {
      continue;
    }
    const colorBits = colorBitsFromSegmentFloat(segments[base + 4]!);
    const lw = lineWeightHundredthsFromSegment(segments[base + 6]!);
    const order = segStride >= 8 ? segments[base + 7]! : i;
    prims.push({
      order,
      kind: 'line',
      colorBits,
      lw,
      x1: segments[base]!,
      y1: segments[base + 1]!,
      x2: segments[base + 2]!,
      y2: segments[base + 3]!,
    });
  }
  const nTri = triangleCount(triangles);
  for (let i = 0; i < nTri; i += 1) {
    const base = i * TRIANGLE_STRIDE;
    const layer = layerIndexFromSegment(triangles[base + 7]!);
    if (!isLayerVisible(visibility, layer)) {
      continue;
    }
    const colorBits = colorBitsFromSegmentFloat(triangles[base + 6]!);
    const order = triangles[base + 9]!;
    prims.push({
      order,
      kind: 'fill',
      colorBits,
      x1: triangles[base]!,
      y1: triangles[base + 1]!,
      x2: triangles[base + 2]!,
      y2: triangles[base + 3]!,
      x3: triangles[base + 4]!,
      y3: triangles[base + 5]!,
    });
  }
  prims.sort((a, b) => a.order - b.order || (a.kind === 'fill' ? -1 : 1));
  return prims;
}

function flushLineBatch(
  batches: DrawBatch[],
  colorBits: number,
  lineWeightHundredths: number,
  floats: number[],
): void {
  if (floats.length === 0) {
    return;
  }
  batches.push({
    kind: 'line',
    colorBits,
    lineWeightHundredths,
    positions: Float32Array.from(floats),
    vertexCount: floats.length / 2,
  });
}

function flushFillBatch(batches: DrawBatch[], colorBits: number, floats: number[]): void {
  if (floats.length === 0) {
    return;
  }
  batches.push({
    kind: 'fill',
    colorBits,
    positions: Float32Array.from(floats),
    vertexCount: floats.length / 2,
  });
}

export function buildOrderedDrawBatches(
  segments: Float32Array,
  triangles: Float32Array,
  visibility: LayerVisibilityState,
  segStride = SEGMENT_STRIDE,
): DrawBatch[] {
  const prims = collectPrims(segments, triangles, visibility, segStride);
  const batches: DrawBatch[] = [];
  let lineColor = -1;
  let lineLw = -1;
  let lineOrder = -1;
  let lineFloats: number[] = [];
  let fillColor = -1;
  let fillOrder = -1;
  let fillFloats: number[] = [];

  for (const p of prims) {
    if (p.kind === 'fill') {
      if (lineFloats.length > 0) {
        flushLineBatch(batches, lineColor, lineLw, lineFloats);
        lineFloats = [];
        lineColor = -1;
      }
      if ((fillColor !== p.colorBits || fillOrder !== p.order) && fillFloats.length > 0) {
        flushFillBatch(batches, fillColor, fillFloats);
        fillFloats = [];
      }
      fillColor = p.colorBits;
      fillOrder = p.order;
      fillFloats.push(p.x1, p.y1, p.x2, p.y2, p.x3, p.y3);
    } else {
      if (fillFloats.length > 0) {
        flushFillBatch(batches, fillColor, fillFloats);
        fillFloats = [];
        fillColor = -1;
      }
      if (
        (lineColor !== p.colorBits || lineLw !== p.lw || lineOrder !== p.order) &&
        lineFloats.length > 0
      ) {
        flushLineBatch(batches, lineColor, lineLw, lineFloats);
        lineFloats = [];
      }
      lineColor = p.colorBits;
      lineLw = p.lw;
      lineOrder = p.order;
      lineFloats.push(p.x1, p.y1, p.x2, p.y2);
    }
  }
  flushFillBatch(batches, fillColor, fillFloats);
  flushLineBatch(batches, lineColor, lineLw, lineFloats);
  return batches;
}

/** Fill triangles only, sorted by draw order (for hybrid line + fill rendering). */
export function buildFillDrawBatches(
  triangles: Float32Array,
  visibility: LayerVisibilityState,
): FillDrawBatch[] {
  const prims = collectPrims(new Float32Array(0), triangles, visibility, SEGMENT_STRIDE);
  const batches: FillDrawBatch[] = [];
  let fillColor = -1;
  let fillOrder = -1;
  let fillFloats: number[] = [];
  for (const p of prims) {
    if (p.kind !== 'fill') continue;
    if ((fillColor !== p.colorBits || fillOrder !== p.order) && fillFloats.length > 0) {
      flushFillBatch(batches, fillColor, fillFloats);
      fillFloats = [];
    }
    fillColor = p.colorBits;
    fillOrder = p.order;
    fillFloats.push(p.x1, p.y1, p.x2, p.y2, p.x3, p.y3);
  }
  flushFillBatch(batches, fillColor, fillFloats);
  return batches;
}

export async function buildOrderedDrawBatchesAsync(
  segments: Float32Array,
  triangles: Float32Array,
  visibility: LayerVisibilityState,
  segStride = SEGMENT_STRIDE,
): Promise<DrawBatch[]> {
  if (segmentCount(segments, segStride) + triangleCount(triangles) <= SEGMENTS_PER_YIELD) {
    return buildOrderedDrawBatches(segments, triangles, visibility, segStride);
  }
  await yieldToMain();
  return buildOrderedDrawBatches(segments, triangles, visibility, segStride);
}
