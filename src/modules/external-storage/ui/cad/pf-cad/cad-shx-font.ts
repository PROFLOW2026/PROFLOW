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
  /**
   * Shape numbers whose code-7 subshapes were missing, cyclic, or truncated.
   * Partial strokes may still be in `glyphs`. Those characters are not GPU-complete.
   */
  incompleteGlyphs?: Set<number>;
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

/** Byte index immediately after the 0x1A header terminator, or -1. */
function contentStart(bytes: Uint8Array): number {
  const limit = Math.min(bytes.length, 1024);
  for (let j = 0; j < limit; j += 1) {
    if (bytes[j] === 0x1a) return j + 1;
  }
  return -1;
}

function u16(bytes: Uint8Array, i: number): number {
  return bytes[i]! | (bytes[i + 1]! << 8);
}

function i16(bytes: Uint8Array, i: number): number {
  const v = u16(bytes, i);
  return v > 0x7fff ? v - 0x10000 : v;
}

function u32(bytes: Uint8Array, i: number): number {
  return (
    (bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24)) >>> 0
  );
}

function s8(v: number): number {
  return (v & 0x7f) - (v & 0x80 ? 0x80 : 0);
}

/**
 * Text-font records store a leading NUL (or a name then NUL) before bytecode.
 * Verified against @mlightcad/shx-parser `splitShapeNameAndBytecode`.
 */
function stripShapeName(raw: Uint8Array): Uint8Array {
  const z = raw.indexOf(0);
  if (z < 0) return raw;
  return raw.subarray(z + 1);
}

/** Shape 0 / unifont info: name terminated by 0, then above, below, modes. */
function declaredHeightFromInfo(raw: Uint8Array): number {
  let end = -1;
  for (let i = 0; i < raw.length; i += 1) {
    const b = raw[i]!;
    if (b === 0 || b === 10 || b === 13) {
      end = i;
      break;
    }
  }
  if (end < 0 || end + 2 >= raw.length) return 1;
  const above = raw[end + 1]!;
  const below = raw[end + 2]!;
  const height = above + below;
  return height > 0 ? height : 1;
}

type ParsedGlyphTable = {
  glyphs: Map<number, ShxSegment[]>;
  declaredHeight: number;
  incomplete: Set<number>;
};

function emptyTable(): ParsedGlyphTable {
  return { glyphs: new Map(), declaredHeight: 1, incomplete: new Set() };
}

function resolveShapeBodies(
  bodies: Map<number, Uint8Array>,
  fileKind: SubshapeFileKind = 'shapes',
): {
  glyphs: Map<number, ShxSegment[]>;
  incomplete: Set<number>;
} {
  const glyphs = new Map<number, ShxSegment[]>();
  const incomplete = new Set<number>();
  const lookup = (shapeNumber: number) => bodies.get(shapeNumber);
  for (const [code, body] of bodies) {
    const decoded = decodeShapeVectorsDetailed(body, lookup, 0, new Set([code]), fileKind);
    if (!decoded.complete) incomplete.add(code);
    if (decoded.segments.length > 0) glyphs.set(code, decoded.segments);
  }
  return { glyphs, incomplete };
}

/**
 * Shapes 1.0 / 1.1 directory after 0x1A.
 * Layout from @mlightcad/shx-parser shapes content parser: 4-byte gap,
 * int16 shape count, then count × (uint16 code, uint16 byteLength), then bodies.
 */
function parseAsciiShapesPayload(bytes: Uint8Array, start: number): ParsedGlyphTable {
  if (start < 0 || start + 6 > bytes.length) return emptyTable();
  const count = i16(bytes, start + 4);
  if (count <= 0 || start + 6 + count * 4 > bytes.length) return emptyTable();
  const entries: { code: number; length: number }[] = [];
  let i = start + 6;
  for (let n = 0; n < count; n += 1) {
    const code = u16(bytes, i);
    const length = u16(bytes, i + 2);
    i += 4;
    if (length > 0) entries.push({ code, length });
  }
  const bodies = new Map<number, Uint8Array>();
  let declaredHeight = 1;
  for (const entry of entries) {
    if (i + entry.length > bytes.length) break;
    const raw = bytes.subarray(i, i + entry.length);
    i += entry.length;
    if (entry.code === 0) {
      declaredHeight = declaredHeightFromInfo(raw);
      continue;
    }
    bodies.set(entry.code, stripShapeName(raw));
  }
  const resolved = resolveShapeBodies(bodies);
  return { glyphs: resolved.glyphs, declaredHeight, incomplete: resolved.incomplete };
}

/**
 * Unifont content at `start` (byte after 0x1A).
 * Layout from @mlightcad/shx-parser unifont parser: int32 count (includes the
 * info record), int16 info length, info bytes, then (count-1) × (uint16 code,
 * uint16 byteLength, bytes).
 */
function parseUnifontTable(bytes: Uint8Array, start: number): ParsedGlyphTable {
  if (start < 0 || start + 6 > bytes.length) return emptyTable();
  const count =
    (bytes[start]! |
      (bytes[start + 1]! << 8) |
      (bytes[start + 2]! << 16) |
      (bytes[start + 3]! << 24)) |
    0;
  const infoLen = i16(bytes, start + 4);
  if (count <= 0 || infoLen < 0 || start + 6 + infoLen > bytes.length) return emptyTable();
  const info = bytes.subarray(start + 6, start + 6 + infoLen);
  const bodies = new Map<number, Uint8Array>();
  let i = start + 6 + infoLen;
  const glyphCount = count - 1;
  for (let n = 0; n < glyphCount; n += 1) {
    if (i + 4 > bytes.length) break;
    const code = u16(bytes, i);
    const length = u16(bytes, i + 2);
    i += 4;
    if (length <= 0) continue;
    if (i + length > bytes.length) break;
    const raw = bytes.subarray(i, i + length);
    i += length;
    if (code === 0) continue;
    bodies.set(code, stripShapeName(raw));
  }
  const resolved = resolveShapeBodies(bodies);
  return {
    glyphs: resolved.glyphs,
    declaredHeight: declaredHeightFromInfo(info),
    incomplete: resolved.incomplete,
  };
}

/** Unicode / unifont shape table. `start` is the first byte after 0x1A. */
export function parseUnicodeShapesPayload(bytes: Uint8Array, start: number): Map<number, ShxSegment[]> {
  return parseUnifontTable(bytes, start).glyphs;
}

const STACK_CAP = 4;
const OCTANT = Math.PI / 4;
/** Autodesk shape vector components for directions 0–15. */
const SHX_VECTOR: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 0.5],
  [1, 1],
  [0.5, 1],
  [0, 1],
  [-0.5, 1],
  [-1, 1],
  [-1, 0.5],
  [-1, 0],
  [-1, -0.5],
  [-1, -1],
  [-0.5, -1],
  [0, -1],
  [0.5, -1],
  [1, -1],
  [1, -0.5],
];
/** About 8 chords per octant. Chord error is also capped at 0.5 font units. */
const OCTANT_STEP = OCTANT / 8;

/**
 * Decode one shape's bytecode into line segments (font units).
 *
 * Initial state: pen up, origin (0,0), scale 1, empty position stack.
 * Segments are emitted only while the pen is down.
 *
 * Code 7 draws a subshape from `lookup`. Shapes 1.0 use the next byte as the
 * shape number. A 0 byte means the following uint16 LE is the number (shapes
 * 1.1 / unifont). The extended bigfont form (origin, width, height) is not
 * decoded: that reference is incomplete and draws nothing.
 * The subshape starts pen-up in its own bytes. Its segments are translated by
 * the parent position and scaled by the parent scale. Parent scale and the
 * position stack are not changed by the subshape. Parent pen is unchanged.
 * Cycles and depth above 8 are incomplete.
 *
 * Code 13 repeated bulges end on two 0 displacement bytes with no bulge byte
 * on that terminator (same rule as @mlightcad/shx-parser `handleMultipleBulgeArcs`).
 *
 * Vector directions use the Autodesk grid (axis steps of 1, diagonals of 1 and 1/2),
 * multiplied by the length nibble. They are not unit-circle steps of 22.5°.
 *
 * Octant spec byte is Autodesk `(-)0SC`: start octant in bits 4–6, span in the low
 * 3 bits (0 means 8), clockwise when bit 7 is set.
 */
const MAX_SUBSHAPE_DEPTH = 8;

export type SubshapeLookup = (shapeNumber: number) => Uint8Array | undefined;

export type ShapeDecodeResult = {
  segments: ShxSegment[];
  complete: boolean;
  endX: number;
  endY: number;
};

export function decodeShapeVectors(
  data: Uint8Array,
  lookup?: SubshapeLookup,
): ShxSegment[] {
  return decodeShapeVectorsDetailed(data, lookup).segments;
}

export type SubshapeFileKind = 'shapes' | 'bigfont';

export function decodeShapeVectorsDetailed(
  data: Uint8Array,
  lookup?: SubshapeLookup,
  depth = 0,
  chain: ReadonlySet<number> = new Set(),
  fileKind: SubshapeFileKind = 'shapes',
): ShapeDecodeResult {
  const segs: ShxSegment[] = [];
  let x = 0;
  let y = 0;
  let penDown = false;
  let scale = 1;
  let complete = true;
  const stack: { x: number; y: number }[] = [];
  const finish = (ok: boolean): ShapeDecodeResult => ({
    segments: segs,
    complete: ok && complete,
    endX: x,
    endY: y,
  });

  const lineTo = (nx: number, ny: number) => {
    if (penDown && Math.hypot(nx - x, ny - y) > 1e-6) segs.push({ x1: x, y1: y, x2: nx, y2: ny });
    x = nx;
    y = ny;
  };

  const moveScaled = (dx: number, dy: number) => {
    lineTo(x + dx * scale, y + dy * scale);
  };

  const traceArc = (cx: number, cy: number, radius: number, a0: number, a1: number) => {
    const sweep = a1 - a0;
    const absSweep = Math.abs(sweep);
    if (!(radius > 0) || absSweep < 1e-9) return;
    let maxStep = OCTANT_STEP;
    if (radius > 0.5) {
      const cosArg = 1 - 0.5 / radius;
      if (cosArg < 1) {
        const byError = 2 * Math.acos(Math.max(-1, Math.min(1, cosArg)));
        if (byError > 1e-4) maxStep = Math.min(OCTANT_STEP, byError);
      }
    } else {
      maxStep = absSweep;
    }
    const steps = Math.max(1, Math.ceil(absSweep / maxStep));
    for (let k = 1; k <= steps; k += 1) {
      const a = a0 + sweep * (k / steps);
      lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
    }
  };

  const drawDisplacedBulge = (dx: number, dy: number, bulgeByte: number) => {
    const bx = dx * scale;
    const by = dy * scale;
    const ex = x + bx;
    const ey = y + by;
    const bulge = Math.max(-1, Math.min(1, s8(bulgeByte) / 127));
    const chord = Math.hypot(bx, by);
    if (bulge === 0 || chord < 1e-12) {
      lineTo(ex, ey);
      return;
    }
    const included = 4 * Math.atan(Math.abs(bulge));
    const radius = chord / (2 * Math.sin(included / 2));
    const mx = x + bx / 2;
    const my = y + by / 2;
    const px = -by / chord;
    const py = bx / chord;
    const dist = Math.abs(radius * Math.cos(included / 2));
    const clockwise = bulge < 0;
    const cx = clockwise ? mx - px * dist : mx + px * dist;
    const cy = clockwise ? my - py * dist : my + py * dist;
    let a0 = Math.atan2(y - cy, x - cx);
    let a1 = Math.atan2(ey - cy, ex - cx);
    if (clockwise) {
      if (a1 >= a0) a1 -= Math.PI * 2;
    } else if (a1 <= a0) a1 += Math.PI * 2;
    traceArc(cx, cy, radius, a0, a1);
    lineTo(ex, ey);
  };

  const drawOctantArc = (
    radiusByte: number,
    radiusHi: number,
    spec: number,
    startOffset: number,
    endOffset: number,
  ) => {
    const radius = (radiusByte + radiusHi * 256) * scale;
    const startOct = (spec >> 4) & 7;
    let span = spec & 7;
    if (span === 0) span = 8;
    const clockwise = (spec & 0x80) !== 0;
    const dir = clockwise ? -1 : 1;
    const startAngle = (startOct + dir * (startOffset / 256)) * OCTANT;
    const endAngle = (startOct + dir * (span + endOffset / 256)) * OCTANT;
    if (!(radius > 0)) return;
    const cx = x - radius * Math.cos(startAngle);
    const cy = y - radius * Math.sin(startAngle);
    traceArc(cx, cy, radius, startAngle, endAngle);
    lineTo(cx + radius * Math.cos(endAngle), cy + radius * Math.sin(endAngle));
  };

  const readSubshapeRef = (
    i: number,
  ): { shape: number; next: number } | null => {
    if (i + 1 >= data.length) return null;
    const spec = data[i + 1]!;
    if (spec !== 0) return { shape: spec, next: i + 2 };
    if (i + 3 >= data.length) return null;
    const shape = data[i + 2]! | (data[i + 3]! << 8);
    if (shape === 0) return null;
    return { shape, next: i + 4 };
  };

  const skipSubshapeRef = (i: number): number => {
    if (fileKind === 'bigfont' && i + 1 < data.length && data[i + 1] === 0) {
      return Math.min(data.length, i + 8);
    }
    const ref = readSubshapeRef(i);
    return ref ? ref.next : data.length;
  };

  const skipDisplacementPairs = (i: number): number => {
    let p = i + 1;
    while (p + 1 < data.length) {
      const dx = data[p]!;
      const dy = data[p + 1]!;
      p += 2;
      if (dx === 0 && dy === 0) break;
    }
    return p;
  };

  const skipBulgeTriples = (i: number): number => {
    let p = i + 1;
    while (p + 1 < data.length) {
      const dx = data[p]!;
      const dy = data[p + 1]!;
      p += 2;
      if (dx === 0 && dy === 0) break;
      if (p >= data.length) break;
      p += 1;
    }
    return p;
  };

  const skipCommand = (i: number): number => {
    if (i >= data.length) return data.length;
    const b = data[i]!;
    if (b >= 16) return i + 1;
    switch (b) {
      case 0:
      case 1:
      case 2:
      case 5:
      case 6:
        return i + 1;
      case 3:
      case 4:
        return Math.min(data.length, i + 2);
      case 7:
        return skipSubshapeRef(i);
      case 8:
        return Math.min(data.length, i + 3);
      case 9:
        return skipDisplacementPairs(i);
      case 10:
        return Math.min(data.length, i + 3);
      case 11:
        return Math.min(data.length, i + 6);
      case 12:
        return Math.min(data.length, i + 4);
      case 13:
        return skipBulgeTriples(i);
      case 14:
        return skipCommand(i + 1);
      default:
        return i + 1;
    }
  };

  let i = 0;
  while (i < data.length) {
    const b = data[i]!;
    if (b === 0) break;
    if (b >= 16) {
      const length = (b >> 4) & 0x0f;
      const direction = b & 0x0f;
      const [vx, vy] = SHX_VECTOR[direction]!;
      moveScaled(length * vx, length * vy);
      i += 1;
      continue;
    }
    switch (b) {
      case 1:
        penDown = true;
        i += 1;
        break;
      case 2:
        penDown = false;
        i += 1;
        break;
      case 3: {
        if (i + 1 >= data.length) return finish(false);
        const divisor = data[i + 1]!;
        if (divisor !== 0) scale /= divisor;
        i += 2;
        break;
      }
      case 4: {
        if (i + 1 >= data.length) return finish(false);
        scale *= data[i + 1]!;
        i += 2;
        break;
      }
      case 5:
        if (stack.length < STACK_CAP) stack.push({ x, y });
        i += 1;
        break;
      case 6: {
        const popped = stack.pop();
        if (popped) {
          x = popped.x;
          y = popped.y;
        }
        i += 1;
        break;
      }
      case 7: {
        if (fileKind === 'bigfont' && i + 1 < data.length && data[i + 1] === 0) {
          if (i + 7 >= data.length) return finish(false);
          i += 8;
          complete = false;
          break;
        }
        const ref = readSubshapeRef(i);
        if (!ref) return finish(false);
        i = ref.next;
        if (
          depth >= MAX_SUBSHAPE_DEPTH ||
          chain.has(ref.shape) ||
          !lookup
        ) {
          complete = false;
          break;
        }
        const raw = lookup(ref.shape);
        if (!raw) {
          complete = false;
          break;
        }
        const nextChain = new Set(chain);
        nextChain.add(ref.shape);
        const savedScale = scale;
        const nested = decodeShapeVectorsDetailed(
          raw,
          lookup,
          depth + 1,
          nextChain,
          fileKind,
        );
        scale = savedScale;
        if (!nested.complete) complete = false;
        const ox = x;
        const oy = y;
        for (const s of nested.segments) {
          segs.push({
            x1: ox + s.x1 * scale,
            y1: oy + s.y1 * scale,
            x2: ox + s.x2 * scale,
            y2: oy + s.y2 * scale,
          });
        }
        x = ox + nested.endX * scale;
        y = oy + nested.endY * scale;
        break;
      }
      case 8: {
        if (i + 2 >= data.length) return finish(false);
        moveScaled(s8(data[i + 1]!), s8(data[i + 2]!));
        i += 3;
        break;
      }
      case 9: {
        let p = i + 1;
        while (p + 1 < data.length) {
          const dx = s8(data[p]!);
          const dy = s8(data[p + 1]!);
          p += 2;
          if (dx === 0 && dy === 0) break;
          moveScaled(dx, dy);
        }
        i = p;
        break;
      }
      case 10: {
        if (i + 2 >= data.length) return finish(false);
        drawOctantArc(data[i + 1]!, 0, data[i + 2]!, 0, 0);
        i += 3;
        break;
      }
      case 11: {
        if (i + 5 >= data.length) return finish(false);
        drawOctantArc(data[i + 4]!, data[i + 3]!, data[i + 5]!, data[i + 1]!, data[i + 2]!);
        i += 6;
        break;
      }
      case 12: {
        if (i + 3 >= data.length) return finish(false);
        drawDisplacedBulge(s8(data[i + 1]!), s8(data[i + 2]!), data[i + 3]!);
        i += 4;
        break;
      }
      case 13: {
        let p = i + 1;
        while (p + 1 < data.length) {
          const dx = s8(data[p]!);
          const dy = s8(data[p + 1]!);
          p += 2;
          if (dx === 0 && dy === 0) break;
          if (p >= data.length) break;
          const bulge = data[p]!;
          p += 1;
          drawDisplacedBulge(dx, dy, bulge);
        }
        i = p;
        break;
      }
      case 14:
        i = skipCommand(i + 1);
        break;
      default:
        i += 1;
        break;
    }
  }
  return finish(true);
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

type BigfontParsed = {
  map: Map<number, number>;
  glyphs: Map<number, ShxSegment[]>;
  declaredHeight: number;
  incomplete: Set<number>;
};

/**
 * BIGFONT 1.0 after 0x1A, matching @mlightcad/shx-parser:
 * int16 sentinel, int16 itemCount, int16 rangeCount,
 * rangeCount × (uint16 start, uint16 end),
 * then itemCount × (uint16 code, uint16 byteLength, uint32 fileOffset).
 * Shape bytes live at those absolute offsets and each definition ends with 0.
 * The map value is the character code itself: the file stores geometry per code,
 * and the registry looks glyphs up by `map.get(charCode)`.
 */
function parseBigfontContent(bytes: Uint8Array): BigfontParsed | null {
  const head = readHeaderText(bytes, 128);
  if (!head.includes('bigfont') && !head.includes('BIGFONT')) return null;
  const start = contentStart(bytes);
  if (start < 0 || start + 6 > bytes.length) return null;
  const itemCount = i16(bytes, start + 2);
  const rangeCount = i16(bytes, start + 4);
  if (itemCount <= 0 || rangeCount < 0) return null;
  let i = start + 6 + rangeCount * 4;
  if (i > bytes.length || i + itemCount * 8 > bytes.length) return null;
  const records: { code: number; length: number; offset: number }[] = [];
  for (let n = 0; n < itemCount; n += 1) {
    const code = u16(bytes, i);
    const length = u16(bytes, i + 2);
    const offset = u32(bytes, i + 4);
    i += 8;
    if (code === 0 && length === 0 && offset === 0) continue;
    records.push({ code, length, offset });
  }
  if (records.length === 0) return null;
  const map = new Map<number, number>();
  const bodies = new Map<number, Uint8Array>();
  let declaredHeight = 1;
  for (const rec of records) {
    if (rec.length <= 0 || rec.offset + rec.length > bytes.length) continue;
    const raw = bytes.subarray(rec.offset, rec.offset + rec.length);
    if (rec.code === 0) {
      declaredHeight = declaredHeightFromInfo(raw);
      continue;
    }
    map.set(rec.code, rec.code);
    bodies.set(rec.code, stripShapeName(raw));
  }
  if (map.size === 0) return null;
  const resolved = resolveShapeBodies(bodies, 'bigfont');
  return {
    map,
    glyphs: resolved.glyphs,
    declaredHeight,
    incomplete: resolved.incomplete,
  };
}

/** BIGFONT 1.x: character code → glyph key (the same code; geometry is in this file). */
export function parseShxBigfontMap(bytes: Uint8Array): Map<number, number> | null {
  return parseBigfontContent(bytes)?.map ?? null;
}

/** BIGFONT file: code map plus shape definitions addressed by the index offsets. */
export function parseShxBigfontFile(name: string, bytes: Uint8Array): ShxBigfontBundle | null {
  const parsed = parseBigfontContent(bytes);
  if (!parsed) return null;
  const metrics = computeShxFontMetrics(parsed.glyphs, parsed.declaredHeight);
  const font: ShxFont = {
    name,
    height: metrics.capHeight,
    glyphs: parsed.glyphs,
    metrics,
    kind: 'bigfont',
    incompleteGlyphs: parsed.incomplete,
  };
  return { map: parsed.map, font };
}

export function parseShxFont(name: string, bytes: Uint8Array): ShxFont | null {
  if (bytes.length < 32) return null;
  const kind = detectShxKind(bytes);
  if (!kind || kind === 'bigfont') return null;
  const start = contentStart(bytes);
  if (start < 0) return null;
  const head = readHeaderText(bytes, 128);
  const table = head.includes('unifont')
    ? parseUnifontTable(bytes, start)
    : parseAsciiShapesPayload(bytes, start);
  if (table.glyphs.size === 0) return null;
  const metrics = computeShxFontMetrics(table.glyphs, table.declaredHeight);
  return {
    name,
    height: metrics.capHeight,
    glyphs: table.glyphs,
    metrics,
    kind,
    incompleteGlyphs: table.incomplete,
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
