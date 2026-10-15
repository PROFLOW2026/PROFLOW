/** AutoCAD SHX shapes 1.x stroke font (no proprietary runtime). */

export type ShxSegment = { x1: number; y1: number; x2: number; y2: number };

export type ShxFont = {
  name: string;
  /** Shape height in font units (typically above cap). */
  height: number;
  glyphs: Map<number, ShxSegment[]>;
};

const SHAPES_MAGIC = 'AutoCAD-86 shapes';

function readHeader(bytes: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(256, bytes.length)));
  return head.includes(SHAPES_MAGIC) || head.includes('AutoCAD-86');
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

function parseShapesPayload(bytes: Uint8Array, start: number): Map<number, ShxSegment[]> {
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

/** BIGFONT 1.x: map Unicode / DBCS code → shape number in companion shapes file. */
export function parseShxBigfontMap(bytes: Uint8Array): Map<number, number> | null {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(128, bytes.length)));
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

export function parseShxFont(name: string, bytes: Uint8Array): ShxFont | null {
  if (bytes.length < 32) return null;
  if (!readHeader(bytes)) return null;
  let start = 23;
  for (let j = 0; j < Math.min(bytes.length - 1, 256); j += 1) {
    if (bytes[j] === 0x1a) {
      start = j + 1;
      if (bytes[start] === 0) start += 1;
      break;
    }
  }
  const glyphs = parseShapesPayload(bytes, start);
  if (glyphs.size === 0) return null;
  return { name, height: 1, glyphs };
}

export function shxGlyphAdvance(font: ShxFont, code: number): number {
  const g = font.glyphs.get(code);
  if (!g || g.length === 0) return font.height * 0.6;
  let maxX = 0;
  for (const s of g) maxX = Math.max(maxX, s.x2, s.x1);
  return Math.max(maxX + font.height * 0.15, font.height * 0.45);
}

export function measureShxTextWidth(font: ShxFont, text: string, capH: number): number {
  const scale = capH / font.height;
  let penX = 0;
  for (const ch of text) {
    penX += shxGlyphAdvance(font, ch.charCodeAt(0)) * scale;
  }
  return penX;
}

export function drawShxLine(
  ctx: CanvasRenderingContext2D,
  font: ShxFont,
  text: string,
  capH: number,
  fillStyle: string,
  mapCode: (code: number) => number = (c) => c,
): { width: number } {
  const scale = capH / font.height;
  ctx.strokeStyle = fillStyle;
  ctx.lineWidth = Math.max(1, capH * 0.08);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let penX = 0;
  for (const ch of text) {
    const code = mapCode(ch.charCodeAt(0));
    const glyph = font.glyphs.get(code);
    if (glyph) {
      ctx.beginPath();
      for (const s of glyph) {
        ctx.moveTo(penX + s.x1 * scale, -s.y1 * scale);
        ctx.lineTo(penX + s.x2 * scale, -s.y2 * scale);
      }
      ctx.stroke();
    }
    penX += shxGlyphAdvance(font, mapCode(ch.charCodeAt(0))) * scale;
  }
  return { width: penX };
}
