import type { CadText } from './types';
import type { CadView } from './renderer';
import { worldToScreen } from './renderer';
import { maybeDecodeHebrewShxText } from './hebrew-shx-decode';
import { drawShxLine, measureShxTextBlock, type ShxFont } from './cad-shx-font';
import { resolveShxDrawContext } from './cad-shx-registry';

export const CAP_HEIGHT_RATIO = 0.714;
export const FONT_SIZE_FACTOR = 1 / CAP_HEIGHT_RATIO;

const MIN_SCREEN_PX = 2;
const CULL_PAD_PX = 8;

export type TextDrawContext = {
  ctx: CanvasRenderingContext2D;
  view: CadView;
  viewport: { width: number; height: number };
  origin: [number, number];
  fontFamily: string;
  /** Optional map from DWG text style → @font-face family (customer TTF/OTF from storage). */
  styleFontFamily?: (style: string | number | undefined) => string;
  /** Optional SHX stroke fonts keyed by style name. */
  shxFont?: (style: string | number | undefined) => ShxFont | undefined;
};

/** Map MTEXT attachment point 1–9 (numpad) to horizontal / vertical alignment indices. */
export function attachmentToAlign(att: number): { ha: number; va: number } {
  const clamped = Math.min(9, Math.max(1, Math.round(att)));
  const ha = (clamped - 1) % 3;
  const va = Math.floor((clamped - 1) / 3);
  return { ha, va };
}

/**
 * Offset from insertion point to local draw origin (before entity rotation).
 * ha: 0 left, 1 center, 2 right; va: 0 baseline, 1 bottom, 2 middle, 3 top.
 */
export function anchorOffset(
  ha: number | undefined,
  va: number | undefined,
  w: number,
  capH: number,
  descent: number,
  blockH: number = capH,
): { dx: number; dy: number } {
  const h = ha ?? 0;
  const v = va ?? 0;
  let dx = 0;
  if (h === 1) dx = -w / 2;
  else if (h === 2) dx = -w;

  let dy = 0;
  if (v === 0) {
    dy = 0;
  } else if (v === 1) {
    dy = -blockH + descent;
  } else if (v === 2) {
    dy = -blockH / 2 - capH / 2 + descent;
  } else if (v === 3) {
    dy = -blockH;
  }
  return { dx, dy };
}

function mapCanvasTextAlign(ha: number | undefined): CanvasTextAlign {
  if (ha === 1) return 'center';
  if (ha === 2) return 'right';
  return 'left';
}

function lineSpacingPx(capH: number, lsf: number | undefined): number {
  return capH * (lsf != null && lsf > 0 ? lsf : 1.2);
}

function measureBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  capH: number,
  lsf: number | undefined,
): { w: number; blockH: number; descent: number } {
  let w = 0;
  let descent = capH * 0.22;
  for (const line of lines) {
    const m = ctx.measureText(line);
    w = Math.max(w, m.width);
    if (m.actualBoundingBoxDescent > 0) {
      descent = Math.max(descent, m.actualBoundingBoxDescent);
    }
  }
  const spacing = lineSpacingPx(capH, lsf);
  const blockH = lines.length <= 1 ? capH : capH + (lines.length - 1) * spacing;
  return { w, blockH, descent };
}

/** DWG mirror flags are booleans in WASM JSON; only `true` means scale −1. */
export function mirrorScale(value: boolean | number | undefined): number {
  if (value === true) return -1;
  if (typeof value === 'number' && Number.isFinite(value) && value !== 0 && value !== 1) {
    return value;
  }
  return 1;
}

function applyTextMatrix(ctx: CanvasRenderingContext2D, tx: CadText): void {
  const mx = mirrorScale(tx.bx);
  const my = mirrorScale(tx.by);
  if (mx !== 1 || my !== 1) {
    ctx.transform(mx, 0, 0, my, 0, 0);
  }
  const wf = tx.wf ?? 1;
  const obl = tx.obl ?? 0;
  if (wf !== 1 || obl !== 0) {
    ctx.transform(wf, 0, Math.tan(obl) * wf, 1, 0, 0);
  }
}

function isCulled(
  sx: number,
  sy: number,
  w: number,
  h: number,
  viewport: { width: number; height: number },
): boolean {
  const pad = CULL_PAD_PX;
  const half = Math.max(w, h) * 0.6 + pad;
  return (
    sx + half < 0 ||
    sx - half > viewport.width ||
    sy + half < 0 ||
    sy - half > viewport.height
  );
}

export function drawCadText(
  draw: TextDrawContext,
  tx: CadText,
  zoom: number,
): void {
  if (tx.invisible) return;

  const [ox, oy] = draw.origin;
  const [sx, sy] = worldToScreen(tx.x - ox, tx.y - oy, draw.view, draw.viewport);
  const capH = tx.h * zoom;
  if (capH < MIN_SCREEN_PX) return;

  const rawLines =
    tx.lines && tx.lines.length > 0
      ? tx.lines
      : tx.t.split('\n').filter((line, i, arr) => line.length > 0 || arr.length === 1);
  const lines = rawLines.map((line) => maybeDecodeHebrewShxText(line, tx.style));
  if (lines.length === 0 || (lines.length === 1 && !lines[0]?.trim())) return;

  const shx = draw.shxFont?.(tx.style);
  const shxCtx =
    shx != null
      ? resolveShxDrawContext(tx.style != null ? String(tx.style) : undefined)
      : null;
  const shxPrimary = shxCtx?.primary ?? shx;
  const fillStyle = `#${(tx.c >>> 0).toString(16).padStart(6, '0')}`;
  const fontPx = capH * FONT_SIZE_FACTOR;
  const family = draw.styleFontFamily?.(tx.style) ?? draw.fontFamily;
  draw.ctx.save();
  draw.ctx.direction = 'ltr';

  let w: number;
  let blockH: number;
  let descent: number;
  if (shxPrimary && shxCtx) {
    const measured = measureShxTextBlock(
      shxPrimary,
      lines,
      capH,
      tx.lsf,
      shxCtx.mapCode,
      shxCtx.pickFont,
    );
    w = measured.w;
    blockH = measured.blockH;
    descent = measured.descent;
  } else {
    draw.ctx.font = `${fontPx}px ${family}, ${draw.fontFamily}`;
    ({ w, blockH, descent } = measureBlock(draw.ctx, lines, capH, tx.lsf));
  }
  if (isCulled(sx, sy, w, blockH, draw.viewport)) {
    draw.ctx.restore();
    return;
  }

  let ha = tx.ha;
  let va = tx.va;
  if (tx.att != null) {
    const mapped = attachmentToAlign(tx.att);
    ha = mapped.ha;
    va = mapped.va;
  }

  const { dx, dy } = anchorOffset(ha, va, w, blockH, descent, blockH);
  const spacing = lineSpacingPx(capH, tx.lsf);

  draw.ctx.translate(sx, sy);
  draw.ctx.rotate(-tx.r);
  applyTextMatrix(draw.ctx, tx);
  draw.ctx.translate(dx, dy);

  draw.ctx.fillStyle = fillStyle;
  draw.ctx.textAlign = mapCanvasTextAlign(ha);
  draw.ctx.textBaseline = 'alphabetic';

  const anchorX = ha === 1 ? w / 2 : ha === 2 ? w : 0;
  if (shxPrimary && shxCtx) {
    for (let i = 0; i < lines.length; i += 1) {
      const y = i * spacing;
      draw.ctx.save();
      draw.ctx.translate(anchorX, y);
      drawShxLine(
        draw.ctx,
        shxPrimary,
        lines[i]!,
        capH,
        fillStyle,
        shxCtx.mapCode,
        shxCtx.pickFont,
      );
      draw.ctx.restore();
    }
  } else {
    for (let i = 0; i < lines.length; i += 1) {
      const y = i * spacing;
      draw.ctx.fillText(lines[i]!, anchorX, y);
    }
  }

  draw.ctx.restore();
}
