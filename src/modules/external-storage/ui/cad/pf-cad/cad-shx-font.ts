/** AutoCAD SHX shapes 1.x stroke font (no proprietary runtime). */

export type ShxSegment = { x1: number; y1: number; x2: number; y2: number };

export type ShxFontMetrics = {
  /** Font-unit cap height (from shape 0 or glyph bounds). */
  capHeight: number;
  /** Font-unit distance below baseline (positive = descender depth). */
  descent: number;
  /** Font-unit ascender above baseline. */
  ascent: number;
};

export type ShxFont = {
  name: string;
  /** Shape height in font units (typically above cap). */
  height: number;
  glyphs: Map<number, ShxSegment[]>;
  metrics: ShxFontMetrics;
  /** `1.0` ASCII shapes, `1.1` Unicode code points, `bigfont` companion glyphs. */
  kind: '1.0' | '1.1' | 'bigfont';
};

export type ShxBigfontBundle = {
  map: Map<number, number>;
  font: ShxFont;
};

const SHAPES_MAGIC = 'AutoCAD-86 shapes';

function readHeaderText(bytes: Uint8Array, max = 256): string {
  return new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(max, bytes.length)));
}

function readHeader(bytes: Uint8Array): boolean {
  const head = readHeaderText(bytes);
  return head.includes(SHAPES_MAGIC) || head.includes('AutoCAD-86');
}

function detectShxKind(bytes: Uint8Array): ShxFont['kind'] | null {
  const head = readHeaderText(bytes, 128);
  if (head.includes('bigfont') || head.includes('BIGFONT')) return 'bigfont';
  if (head.includes('shapes 1.1') || head.includes('unifont')) return '1.1';
  if (readHeader(bytes)) return '1.0';
  return null;
}

function findShapePayloadStart(bytes: Uint8Array): number {
  let start = 23;
  for (let j = 0; j < Math.min(bytes.length - 1, 256); j += 1) {
    if (bytes[j] === 0x1a) {
      start = j + 1;
      if (bytes[start] === 0) start += 1;
      break;
    }
  }
  return start;
}

/** Decode one shape definition byte stream into polylines (font units). */
export function decodeShapeVectors(data: Uint8Array): ShxSegment[] {
  const segs: ShxSegment[] = [];
  let x = 0;
  let y = 0;
  let penDown = true;
  let i = 0;
  while (i < data.length) {
    const b = data[i]!;
    i += 1;
    if (b === 0) continue;
    if (b === 14) break;
    if (b === 13) {
      penDown = false;
      continue;
    }
    if (b === 12) {
      penDown = true;
      continue;
    }
    if (b >= 1 && b <= 15) {
      const lenByte = i < data.length ? data[i]! : 0;
      i += 1;
      const dist = lenByte / 16;
      const dir = (b - 1) * (Math.PI / 4);
      const nx = x + Math.cos(dir) * dist;
      const ny = y + Math.sin(dir) * dist;
      if (penDown) segs.push({ x1: x, y1: y, x2: nx, y2: ny });
      x = nx;
      y = ny;
      continue;
    }
    if (b === 8 && i + 1 < data.length) {
      const count = data[i]!;
      i += 1;
      for (let k = 0; k < count && i + 1 < data.length; k += 1) {
        const vx = (data[i]! - 128) / 16;
        const vy = (data[i + 1]! - 128) / 16;
        i += 2;
        const nx = x + vx;
        const ny = y + vy;
        if (penDown) segs.push({ x1: x, y1: y, x2: nx, y2: ny });
        x = nx;
        y = ny;
      }
      continue;
    }
  }
  return segs;
}

function parseAsciiShapesPayload(bytes: Uint8Array, start: number): Map<number, ShxSegment[]> {
  const glyphs = new Map<number, ShxSegment[]>();
  let i = start;
  while (i + 3 < bytes.length) {
    const num = bytes[i]!;
    const len = bytes[i + 1]!;
    i += 2;
    if (len === 0 || i + len > bytes.length) break;
    const spec = bytes.subarray(i, i + len);
    i += len;
    if (num === 0) continue;
    const vectors = decodeShapeVectors(spec);
    if (vectors.length > 0) glyphs.set(num, vectors);
  }
  return glyphs;
}

/** Unicode SHX (shapes 1.1 / unifont): 16-bit code point + length + spec. */
export function parseUnicodeShapesPayload(bytes: Uint8Array, start: number): Map<number, ShxSegment[]> {
  const glyphs = new Map<number, ShxSegment[]>();
  let i = start;
  while (i + 4 < bytes.length) {
    const num = bytes[i]! | (bytes[i + 1]! << 8);
    const len = bytes[i + 2]!;
    i += 3;
    if (len === 0 && num === 0) break;
    if (len === 0 || i + len > bytes.length) break;
    const spec = bytes.subarray(i, i + len);
    i += len;
    if (num === 0) continue;
    const vectors = decodeShapeVectors(spec);
    if (vectors.length > 0) glyphs.set(num, vectors);
  }
  return glyphs;
}

function boundsFromGlyphs(glyphs: Map<number, ShxSegment[]>): {
  minY: number;
  maxY: number;
  maxX: number;
} {
  let minY = 0;
  let maxY = 1;
  let maxX = 0.6;
  for (const segs of glyphs.values()) {
    for (const s of segs) {
      minY = Math.min(minY, s.y1, s.y2);
      maxY = Math.max(maxY, s.y1, s.y2);
      maxX = Math.max(maxX, s.x1, s.x2);
    }
  }
  return { minY, maxY, maxX };
}

export function measureShxFontMetrics(font: ShxFont): ShxFontMetrics {
  return font.metrics;
}

export function computeShxFontMetrics(
  glyphs: Map<number, ShxSegment[]>,
  declaredHeight: number,
): ShxFontMetrics {
  const zero = glyphs.get(0);
  if (zero && zero.length > 0) {
    const b = boundsFromGlyphs(new Map([[0, zero]]));
    return {
      capHeight: Math.max(declaredHeight, b.maxY - b.minY, 1),
      descent: Math.max(0, -b.minY),
      ascent: Math.max(b.maxY, declaredHeight),
    };
  }
  const b = boundsFromGlyphs(glyphs);
  const capHeight = Math.max(declaredHeight, b.maxY - b.minY, 1);
  return {
    capHeight,
    descent: Math.max(0, -b.minY, capHeight * 0.12),
    ascent: Math.max(b.maxY, capHeight * 0.85),
  };
}

/** BIGFONT 1.x: map Unicode / DBCS code → shape number in companion shapes file. */
export function parseShxBigfontMap(bytes: Uint8Array): Map<number, number> | null {
  const head = readHeaderText(bytes, 128);
  if (!head.includes('bigfont') && !head.includes('BIGFONT')) return null;
  const map = new Map<number, number>();
  let i = 0;
  for (let j = 0; j < bytes.length - 1; j += 1) {
    if (bytes[j] === 0x1a) {
      i = j + 1;
      break;
    }
  }
  while (i + 3 < bytes.length) {
    const code = bytes[i]! | (bytes[i + 1]! << 8);
    const shape = bytes[i + 2]!;
    i += 3;
    if (code === 0 && shape === 0) break;
    map.set(code, shape);
  }
  return map.size > 0 ? map : null;
}

/** BIGFONT file: code map plus shape definitions that follow the map table. */
export function parseShxBigfontFile(name: string, bytes: Uint8Array): ShxBigfontBundle | null {
  const map = parseShxBigfontMap(bytes);
  if (!map) return null;
  let i = 0;
  for (let j = 0; j < bytes.length - 1; j += 1) {
    if (bytes[j] === 0x1a) {
      i = j + 1;
      break;
    }
  }
  while (i + 3 < bytes.length) {
    const code = bytes[i]! | (bytes[i + 1]! << 8);
    const shape = bytes[i + 2]!;
    i += 3;
    if (code === 0 && shape === 0) break;
  }
  const glyphs = parseAsciiShapesPayload(bytes, i);
  const metrics = computeShxFontMetrics(glyphs, 1);
  const font: ShxFont = {
    name,
    height: metrics.capHeight,
    glyphs,
    metrics,
    kind: 'bigfont',
  };
  return { map, font };
}

export function parseShxFont(name: string, bytes: Uint8Array): ShxFont | null {
  if (bytes.length < 32) return null;
  const kind = detectShxKind(bytes);
  if (!kind || kind === 'bigfont') return null;
  const start = findShapePayloadStart(bytes);
  const glyphs =
    kind === '1.1'
      ? parseUnicodeShapesPayload(bytes, start)
      : parseAsciiShapesPayload(bytes, start);
  if (glyphs.size === 0) return null;
  const metrics = computeShxFontMetrics(glyphs, 1);
  return {
    name,
    height: metrics.capHeight,
    glyphs,
    metrics,
    kind,
  };
}

export function isDrawableShxCharacter(ch: string): boolean {
  if (!ch || ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') return false;
  return ch.trim().length > 0;
}

/** Open rectangle in font units when a shape is missing (avoids silent gaps). */
export function shxMissingGlyphStroke(font: ShxFont): ShxSegment[] {
  const w = font.height * 0.55;
  const cap = font.height * 0.75;
  return [
    { x1: 0, y1: 0, x2: w, y2: 0 },
    { x1: w, y1: 0, x2: w, y2: cap },
    { x1: w, y1: cap, x2: 0, y2: cap },
    { x1: 0, y1: cap, x2: 0, y2: 0 },
  ];
}

/** Real SHX vectors only — never placeholder boxes (Canvas/GPU use TTF or skip). */
export function resolveShxGlyphStroke(
  font: ShxFont,
  mappedCode: number,
  ch: string,
): ShxSegment[] | null {
  const glyph = font.glyphs.get(mappedCode);
  if (glyph && glyph.length > 0) return glyph;
  if (!isDrawableShxCharacter(ch)) return null;
  return null;
}

export function shxGlyphAdvance(font: ShxFont, code: number): number {
  const g = font.glyphs.get(code);
  if (!g || g.length === 0) return font.height * 0.6;
  let maxX = 0;
  for (const s of g) maxX = Math.max(maxX, s.x2, s.x1);
  return Math.max(maxX + font.height * 0.15, font.height * 0.45);
}

export function measureShxTextWidth(
  font: ShxFont,
  text: string,
  capH: number,
  mapCode: (code: number) => number = (c) => c,
  pickFont?: (code: number, mapped: number) => ShxFont,
): number {
  const scale = capH / font.height;
  let penX = 0;
  for (const ch of text) {
    const raw = ch.charCodeAt(0);
    const mapped = mapCode(raw);
    const active = pickFont?.(raw, mapped) ?? font;
    penX += shxGlyphAdvance(active, mapped) * (capH / active.height);
  }
  return penX;
}

export function measureShxTextBlock(
  font: ShxFont,
  lines: string[],
  capH: number,
  lineSpacingFactor: number | undefined,
  mapCode: (code: number) => number = (c) => c,
  pickFont?: (code: number, mapped: number) => ShxFont,
): { w: number; blockH: number; descent: number; capHeight: number } {
  let w = 0;
  for (const line of lines) {
    w = Math.max(w, measureShxTextWidth(font, line, capH, mapCode, pickFont));
  }
  const metrics = measureShxFontMetrics(font);
  const scale = capH / font.height;
  const descent = metrics.descent * scale;
  const spacing = capH * (lineSpacingFactor != null && lineSpacingFactor > 0 ? lineSpacingFactor : 1.2);
  const blockH = lines.length <= 1 ? capH : capH + (lines.length - 1) * spacing;
  return { w, blockH, descent, capHeight: capH };
}

export type ShxTtfGlyphFallback = {
  fontPx: number;
  family: string;
  baseFamily: string;
  /** When true, draw Hebrew via fillText if the SHX shape is missing. */
  hebrewWhenMissing?: boolean;
  hasHebrew?: (text: string) => boolean;
  /** When true, draw any missing SHX shape via fillText (no placeholder rectangles). */
  fillWhenMissing?: boolean;
};

export function drawShxLine(
  ctx: CanvasRenderingContext2D,
  font: ShxFont,
  text: string,
  capH: number,
  fillStyle: string,
  mapCode: (code: number) => number = (c) => c,
  pickFont?: (code: number, mapped: number) => ShxFont,
  ttfFallback?: ShxTtfGlyphFallback,
): { width: number } {
  let penX = 0;
  for (const ch of text) {
    const raw = ch.charCodeAt(0);
    const mapped = mapCode(raw);
    const active = pickFont?.(raw, mapped) ?? font;
    const scale = capH / active.height;
    ctx.strokeStyle = fillStyle;
    ctx.lineWidth = Math.max(1, capH * 0.08);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const native = active.glyphs.get(mapped);
    const stroke = resolveShxGlyphStroke(active, mapped, ch);
    const missingShape = !native || native.length === 0;
    const useTtfFill =
      missingShape &&
      ttfFallback &&
      isDrawableShxCharacter(ch) &&
      (ttfFallback.fillWhenMissing ||
        (ttfFallback.hebrewWhenMissing && ttfFallback.hasHebrew?.(ch)));
    if (useTtfFill) {
      ctx.font = `${ttfFallback.fontPx}px ${ttfFallback.family}, ${ttfFallback.baseFamily}`;
      ctx.fillStyle = fillStyle;
      ctx.fillText(ch, penX, 0);
    } else if (stroke) {
      ctx.beginPath();
      for (const s of stroke) {
        ctx.moveTo(penX + s.x1 * scale, -s.y1 * scale);
        ctx.lineTo(penX + s.x2 * scale, -s.y2 * scale);
      }
      ctx.stroke();
    }
    penX += shxGlyphAdvance(active, mapped) * scale;
  }
  return { width: penX };
}
