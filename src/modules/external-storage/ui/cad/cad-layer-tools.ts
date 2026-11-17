export type LayerGroup =
  | 'architecture'
  | 'electrical'
  | 'lighting'
  | 'comms'
  | 'dimensions'
  | 'text'
  | 'furniture'
  | 'axes'
  | 'unknown';

const NAMED: readonly { group: Exclude<LayerGroup, 'architecture' | 'unknown'>; pattern: RegExp }[] = [
  { group: 'dimensions', pattern: /(^|[^a-z])(dim|dimension|מידות)([^a-z]|$)/i },
  { group: 'text', pattern: /(^|[^a-z])(text|anno|טקסט|כיתוב)([^a-z]|$)/i },
  { group: 'furniture', pattern: /(^|[^a-z])(furn|furniture|ריהוט)([^a-z]|$)/i },
  { group: 'axes', pattern: /(^|[^a-z])(axis|axes|grid|ציר|סרגל)([^a-z]|$)/i },
  { group: 'lighting', pattern: /(^|[^a-z])(light|lighting|תאורה)([^a-z]|$)/i },
  { group: 'comms', pattern: /(^|[^a-z])(comm|data|תקשורת)([^a-z]|$)/i },
  { group: 'electrical', pattern: /(^|[^a-z])(elec|electric|power|חשמל)([^a-z]|$)/i },
];

/**
 * A real xref prefix is architecture. A name is a group only when the word is explicit.
 * A layer that merely starts with E stays unknown, and unknown layers are never auto-hidden.
 */
export function suggestLayerGroup(name: string, architectural: boolean): LayerGroup {
  if (architectural) return 'architecture';
  for (const row of NAMED) {
    if (row.pattern.test(name)) return row.group;
  }
  return 'unknown';
}

export function layersForGroup(
  layers: readonly { index: number; name: string }[],
  architectural: ReadonlySet<number>,
  group: LayerGroup,
): number[] {
  if (group === 'unknown') return [];
  return layers
    .filter((layer) => suggestLayerGroup(layer.name, architectural.has(layer.index)) === group)
    .map((layer) => layer.index);
}

export function layerIndexNear(
  segments: Float32Array,
  stride: number,
  x: number,
  y: number,
  radius: number,
): number | null {
  const radiusSq = radius * radius;
  let best = radiusSq;
  let layer: number | null = null;
  for (let i = 0; i + stride - 1 < segments.length; i += stride) {
    const x1 = segments[i] ?? 0;
    const y1 = segments[i + 1] ?? 0;
    const x2 = segments[i + 2] ?? 0;
    const y2 = segments[i + 3] ?? 0;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq));
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    const distance = (x - px) ** 2 + (y - py) ** 2;
    if (distance <= best) {
      best = distance;
      layer = Math.trunc(segments[i + 5] ?? -1);
    }
  }
  return layer !== null && layer >= 0 ? layer : null;
}

/** Drawing-unit distance. Callers must not label this as metres unless the DWG names a unit. */
export function drawingDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** Sum of segment lengths. The unit is the drawing unit, never an assumed metre. */
export function cumulativeDistance(points: readonly { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    if (!previous || !current) continue;
    total += drawingDistance(previous.x, previous.y, current.x, current.y);
  }
  return total;
}

/** Shoelace area in drawing units squared. */
export function drawingArea(points: readonly { x: number; y: number }[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!current || !next) continue;
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

/** Nearest segment endpoint inside the radius. Returns the original point when nothing is close. */
export function snapToEndpoint(
  segments: Float32Array,
  stride: number,
  x: number,
  y: number,
  radius: number,
): { x: number; y: number } {
  const radiusSq = radius * radius;
  let best = radiusSq;
  let snapped = { x, y };
  for (let i = 0; i + 3 < segments.length; i += stride) {
    const ends = [
      { x: segments[i] ?? 0, y: segments[i + 1] ?? 0 },
      { x: segments[i + 2] ?? 0, y: segments[i + 3] ?? 0 },
    ];
    for (const end of ends) {
      const distance = (end.x - x) ** 2 + (end.y - y) ** 2;
      if (distance <= best) {
        best = distance;
        snapped = end;
      }
    }
  }
  return snapped;
}
