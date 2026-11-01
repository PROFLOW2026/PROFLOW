import { z } from 'zod';

/**
 * Everything needed to reopen a saved locating result: the 4 + 4 reference pins (normalised per
 * photo), the fit kind, the manual adjustment, the overlay opacity and the stage the adjustment was
 * made on. Stored in infra_comparisons.alignment (jsonb) and mirrored in a sidecar file in the
 * organization's cloud.
 */

const unit = z.number().finite().min(0).max(1);
const pin = z.tuple([unit, unit]);
const pins4 = z.array(pin).length(4);

export const alignmentRecordSchema = z.object({
  version: z.literal(1),
  kind: z.enum(['similarity', 'perspective']),
  beforePins: pins4,
  afterPins: pins4,
  /** Manual nudge on top of the computed fit (stage pixels / radians / ratio). */
  adjust: z
    .object({
      tx: z.number().finite(),
      ty: z.number().finite(),
      scale: z.number().finite().positive().max(20),
      rotation: z.number().finite(),
    })
    .nullish(),
  /** Stage (display box) in which `adjust` was made; lets a reopen on another size scale it. */
  stage: z
    .object({ w: z.number().finite().positive(), h: z.number().finite().positive() })
    .nullish(),
  opacity: z.number().finite().min(0).max(1).default(0.6),
  /** Which view the user was in. */
  view: z.enum(['overlay', 'sideBySide', 'after']).nullish(),
});

export type AlignmentRecord = z.output<typeof alignmentRecordSchema>;
export type AlignmentRecordInput = z.input<typeof alignmentRecordSchema>;

export function parseAlignmentRecord(raw: unknown): AlignmentRecord | null {
  const parsed = alignmentRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Scales a stored manual adjustment when the stage size differs on reopen. */
export function scaleAdjustToStage(
  record: AlignmentRecord,
  stage: { readonly w: number; readonly h: number },
): AlignmentRecord['adjust'] {
  const adjust = record.adjust;
  if (!adjust) return null;
  if (!record.stage || record.stage.w <= 0 || record.stage.h <= 0) return adjust;
  const sx = stage.w / record.stage.w;
  const sy = stage.h / record.stage.h;
  return { ...adjust, tx: adjust.tx * sx, ty: adjust.ty * sy };
}
