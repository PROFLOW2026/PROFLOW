import type { CadText } from './types';
import {
  lookupShxFont,
  resolveShxDrawContext,
  type ShxFont,
} from './cad-shx-registry';
import { shxGlyphAdvance, type ShxSegment } from './cad-shx-font';
import { attachmentToAlign, anchorOffset, mirrorScale } from './draw-cad-text';
import { maybeDecodeHebrewShxText } from './hebrew-shx-decode';
import {
  P8_GPU_TEXT_HANDOFF_ENABLED,
  P8_MIN_GPU_SEGMENTS_PER_TEXT_RECORD,
} from './cad-gpu-text-policy';
import { SEGMENT_STRIDE } from './renderer/segment-format';

const TEXT_LINE_WEIGHT = 13;
const MIN_SHX_GPU_SEGS = 1;

type Affine = [number, number, number, number, number, number];

function mul(a: Affine, b: Affine): Affine {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function translate(tx: number, ty: number): Affine {
  return [1, 0, 0, 1, tx, ty];
}

function rotate(rad: number): Affine {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
}

function transform(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function packColorFloat(colorBits: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, colorBits >>> 0, true);
  return view.getFloat32(0, true);
}

function textLines(tx: CadText): string[] {
  const raw =
    tx.lines && tx.lines.length > 0
      ? tx.lines
      : tx.t.split('\n').filter((line, i, arr) => line.length > 0 || arr.length === 1);
  return raw.map((line) => maybeDecodeHebrewShxText(line, tx.style));
}

type TextLayout = {
  m: Affine;
  lines: string[];
  capH: number;
  anchorX: number;
  spacing: number;
  shxCtx: ReturnType<typeof resolveShxDrawContext>;
  shxPrimary: ShxFont;
};

function layoutShxText(tx: CadText, origin: [number, number]): TextLayout | null {
  const style = tx.style != null ? String(tx.style) : undefined;
  const shxCtx = resolveShxDrawContext(style);
  const shxPrimary = shxCtx.primary ?? lookupShxFont(style);
  if (!shxPrimary) return null;
  const lines = textLines(tx);
  if (lines.length === 0 || (lines.length === 1 && !lines[0]?.trim())) return null;

  let ha = tx.ha;
  let va = tx.va;
  if (tx.att != null) {
    const mapped = attachmentToAlign(tx.att);
    ha = mapped.ha;
    va = mapped.va;
  }

  let w = 0;
  for (const line of lines) {
    let penX = 0;
    for (const ch of line) {
      const raw = ch.charCodeAt(0);
      const mapped = shxCtx.mapCode(raw);
      const active = shxCtx.pickFont(raw, mapped) ?? shxPrimary;
      penX += shxGlyphAdvance(active, mapped) * (tx.h / active.height);
    }
    w = Math.max(w, penX);
  }
  const capH = tx.h;
  const spacing = capH * (tx.lsf != null && tx.lsf > 0 ? tx.lsf : 1.2);
  const blockH = lines.length <= 1 ? capH : capH + (lines.length - 1) * spacing;
  const descent = shxPrimary.metrics.descent * (capH / shxPrimary.height);
  const { dx, dy } = anchorOffset(ha, va, w, capH, descent, blockH);
  const anchorX = ha === 1 ? w / 2 : ha === 2 ? w : 0;

  let m: Affine = translate(tx.x - origin[0], tx.y - origin[1]);
  m = mul(m, rotate(-tx.r));
  const mx = mirrorScale(tx.bx);
  const my = mirrorScale(tx.by);
  if (mx !== 1 || my !== 1) {
    m = mul(m, [mx, 0, 0, my, 0, 0]);
  }
  const wf = tx.wf ?? 1;
  const obl = tx.obl ?? 0;
  if (wf !== 1 || obl !== 0) {
    m = mul(m, [wf, 0, Math.tan(obl) * wf, 1, 0, 0]);
  }
  m = mul(m, translate(dx, dy));
  return { m, lines, capH, anchorX, spacing, shxCtx, shxPrimary };
}

function emitGlyphSegments(
  out: number[],
  font: ShxFont,
  glyph: ShxSegment[],
  penX: number,
  lineY: number,
  capH: number,
  m: Affine,
  colorF: number,
  layerF: number,
  lwF: number,
  orderF: number,
): number {
  const scale = capH / font.height;
  let count = 0;
  for (const s of glyph) {
    const [x1, y1] = transform(m, penX + s.x1 * scale, lineY - s.y1 * scale);
    const [x2, y2] = transform(m, penX + s.x2 * scale, lineY - s.y2 * scale);
    out.push(x1, y1, x2, y2, colorF, layerF, lwF, orderF);
    count += 1;
  }
  return count;
}

/** True when every drawable SHX glyph has stroke geometry (no partial handoff). */
export function isShxTextRecordGpuComplete(tx: CadText, origin: [number, number]): boolean {
  if (tx.invisible) return false;
  const layout = layoutShxText(tx, origin);
  if (!layout) return false;
  const { lines, capH, anchorX, spacing, shxCtx, shxPrimary } = layout;
  let drawable = 0;
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li]!;
    for (const ch of line) {
      if (ch === ' ' || ch === '\t') continue;
      if (ch.trim().length === 0) continue;
      drawable += 1;
      const raw = ch.charCodeAt(0);
      const mapped = shxCtx.mapCode(raw);
      const active = shxCtx.pickFont(raw, mapped) ?? shxPrimary;
      const glyph = active.glyphs.get(mapped);
      if (!glyph || glyph.length === 0) return false;
    }
  }
  if (drawable === 0) return false;
  const segs = countShxTextSegments(tx, origin);
  return segs >= drawable && segs >= P8_MIN_GPU_SEGMENTS_PER_TEXT_RECORD;
}

export function countShxTextSegments(tx: CadText, origin: [number, number]): number {
  if (tx.invisible || tx.gpu) return 0;
  const layout = layoutShxText(tx, origin);
  if (!layout) return 0;
  const { lines, capH, anchorX, spacing, shxCtx, shxPrimary } = layout;
  let total = 0;
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li]!;
    let penX = -anchorX;
    for (const ch of line) {
      const raw = ch.charCodeAt(0);
      const mapped = shxCtx.mapCode(raw);
      const active = shxCtx.pickFont(raw, mapped) ?? shxPrimary;
      const glyph = active.glyphs.get(mapped);
      if (glyph) total += glyph.length;
      penX += shxGlyphAdvance(active, mapped) * (capH / active.height);
    }
  }
  return total;
}

export function appendShxTextSegmentRecords(
  floats: number[],
  tx: CadText,
  origin: [number, number],
  drawOrder: number,
): number {
  const layout = layoutShxText(tx, origin);
  if (!layout) return 0;
  const { m, lines, capH, anchorX, spacing, shxCtx, shxPrimary } = layout;
  const colorF = packColorFloat(tx.c >>> 0);
  const layerF = tx.layer;
  const lwF = TEXT_LINE_WEIGHT;
  const orderF = drawOrder;
  let segCount = 0;
  for (let li = 0; li < lines.length; li += 1) {
    const lineY = li * spacing;
    const line = lines[li]!;
    let penX = -anchorX;
    for (const ch of line) {
      const raw = ch.charCodeAt(0);
      const mapped = shxCtx.mapCode(raw);
      const active = shxCtx.pickFont(raw, mapped) ?? shxPrimary;
      const glyph = active.glyphs.get(mapped);
      if (glyph) {
        segCount += emitGlyphSegments(
          floats,
          active,
          glyph,
          penX,
          lineY,
          capH,
          m,
          colorF,
          layerF,
          lwF,
          orderF,
        );
      }
      penX += shxGlyphAdvance(active, mapped) * (capH / active.height);
    }
  }
  return segCount;
}

export function maxSegmentDrawOrder(segments: Float32Array, stride = SEGMENT_STRIDE): number {
  let max = 0;
  const n = segments.length / stride;
  for (let i = 0; i < n; i += 1) {
    const order = segments[i * stride + 7]!;
    if (order > max) max = order;
  }
  return max;
}

export type ShxGpuAppendResult = {
  segments: Float32Array;
  scene: { texts: CadText[]; gpuTexts?: number };
  shxGpuCount: number;
};

/**
 * Append SHX stroke segments for record-complete texts; marks `gpu:true` for Canvas skip.
 */
export function appendShxGpuSegments(
  wasmSegments: Float32Array,
  scene: { texts: CadText[]; gpuTexts?: number; segmentStride?: number },
  origin: [number, number],
): ShxGpuAppendResult {
  if (!P8_GPU_TEXT_HANDOFF_ENABLED) {
    return { segments: wasmSegments, scene, shxGpuCount: 0 };
  }
  const stride = scene.segmentStride ?? SEGMENT_STRIDE;
  const texts = scene.texts.map((t) => ({ ...t }));
  const floats: number[] = [];
  for (let i = 0; i < wasmSegments.length; i += 1) {
    floats.push(wasmSegments[i]!);
  }
  let baseOrder = maxSegmentDrawOrder(wasmSegments, stride);
  let shxGpuCount = 0;
  let gpuTexts = scene.gpuTexts ?? 0;

  for (const tx of texts) {
    if (tx.gpu || tx.invisible) continue;
    const style = tx.style != null ? String(tx.style) : '';
    if (!resolveShxDrawContext(style).primary && !lookupShxFont(style)) continue;
    if (!isShxTextRecordGpuComplete(tx, origin)) continue;
    const added = appendShxTextSegmentRecords(floats, tx, origin, baseOrder + 1);
    if (added < P8_MIN_GPU_SEGMENTS_PER_TEXT_RECORD) continue;
    tx.gpu = true;
    shxGpuCount += 1;
    gpuTexts += 1;
    baseOrder += 1;
  }

  if (shxGpuCount === 0) {
    return { segments: wasmSegments, scene: { ...scene, texts }, shxGpuCount: 0 };
  }
  return {
    segments: new Float32Array(floats),
    scene: { ...scene, texts, gpuTexts },
    shxGpuCount,
  };
}
