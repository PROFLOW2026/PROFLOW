import { boqSchema, type Boq } from './contracts';

/** Locked approved BOQ: use the stored snapshot labels, never a live catalog recompute. */
export function freezeApprovedBoq(snapshot: unknown, fallback: Boq): Boq {
  const parsed = boqSchema.safeParse(snapshot);
  if (!parsed.success) return { ...fallback, state: 'approved' };
  return { ...parsed.data, state: 'approved' };
}
