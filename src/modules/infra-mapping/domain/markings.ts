import { z } from 'zod';
import { INFRA_MARKING_KINDS, INFRA_TYPES, type InfraMarkingKind, type UnitPoint } from './types';

/**
 * Marking geometry. Coordinates are normalised (0..1) against the ORIGINAL image so a marking stays
 * correct at any display size. Stored as `{ "points": [[x, y], ...] }` in infra_markings.geometry
 * (a typed row per marking - never inside a caption).
 */

export const MAX_MARKINGS_PER_VERSION = 200;
export const MAX_FREEHAND_POINTS = 240;
export const DEFAULT_MARKING_COLOR = '#ef4444';
export const MARKING_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ffffff', '#111827'] as const;

const unit = z.number().finite().min(0).max(1);
const pointSchema = z.tuple([unit, unit]);

const POINT_COUNT: Readonly<Record<InfraMarkingKind, { min: number; max: number }>> = {
  point: { min: 1, max: 1 },
  text: { min: 1, max: 1 },
  arrow: { min: 2, max: 2 },
  line: { min: 2, max: 2 },
  rect: { min: 2, max: 2 },
  ellipse: { min: 2, max: 2 },
  freehand: { min: 2, max: MAX_FREEHAND_POINTS },
};

export const markingInputSchema = z
  .object({
    kind: z.enum(INFRA_MARKING_KINDS),
    points: z.array(pointSchema).min(1).max(MAX_FREEHAND_POINTS),
    label: z.string().trim().max(200).nullish(),
    infraType: z.enum(INFRA_TYPES).nullish(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default(DEFAULT_MARKING_COLOR),
  })
  .superRefine((value, ctx) => {
    const rule = POINT_COUNT[value.kind];
    if (value.points.length < rule.min || value.points.length > rule.max) {
      ctx.addIssue({ code: 'custom', path: ['points'], message: 'invalid_point_count' });
    }
    if (value.kind === 'text' && !(value.label && value.label.length > 0)) {
      ctx.addIssue({ code: 'custom', path: ['label'], message: 'text_required' });
    }
  });

export type MarkingInput = z.input<typeof markingInputSchema>;
export type ParsedMarking = z.output<typeof markingInputSchema>;

export interface DraftMarking {
  readonly kind: InfraMarkingKind;
  readonly points: readonly UnitPoint[];
  readonly label?: string | null;
  readonly infraType?: (typeof INFRA_TYPES)[number] | null;
  readonly color: string;
}

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function toUnitPoint(x: number, y: number, width: number, height: number): UnitPoint {
  if (width <= 0 || height <= 0) return [0, 0];
  return [Math.round(clampUnit(x / width) * 10000) / 10000, Math.round(clampUnit(y / height) * 10000) / 10000];
}

/** Thins a freehand stroke to at most `max` points, keeping first and last. */
export function simplifyStroke(points: readonly UnitPoint[], max = MAX_FREEHAND_POINTS): UnitPoint[] {
  if (points.length <= max) return [...points];
  const result: UnitPoint[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let index = 0; index < max; index += 1) {
    result.push(points[Math.round(index * step)]!);
  }
  return result;
}

/** Wire form stored in the geometry column. */
export function markingGeometry(points: readonly UnitPoint[]): { points: UnitPoint[] } {
  return { points: points.map((point) => [point[0], point[1]] as UnitPoint) };
}

/** Reads the geometry column back; returns null for malformed data. */
export function readMarkingGeometry(geometry: unknown): UnitPoint[] | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const raw = (geometry as { points?: unknown }).points;
  if (!Array.isArray(raw)) return null;
  const points: UnitPoint[] = [];
  for (const item of raw) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const x = Number(item[0]);
    const y = Number(item[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push([clampUnit(x), clampUnit(y)]);
  }
  return points;
}
