import { viewportForMark, type DisplaySheet } from './layout-display';

export type FocusLevel = 'symbol' | 'point' | 'unavailable';

export function focusLevel(onSheet: boolean, located: boolean): FocusLevel {
  if (!onSheet) return 'unavailable';
  if (located) return 'symbol';
  return 'point';
}

function sheetIdInPlan(
  plan: { sheets: readonly DisplaySheet[] },
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  const exact = plan.sheets.find((item) => item.id === id);
  if (exact) return exact.id;
  const lowered = id.toLowerCase();
  const ci = plan.sheets.find((item) => item.id.toLowerCase() === lowered);
  if (ci) return ci.id;
  const name = id.replace(/^layout:/i, '').trim();
  if (!name) return null;
  const named = plan.sheets.find(
    (item) => item.kind === 'layout' && item.label.toLowerCase() === name.toLowerCase(),
  );
  return named?.id ?? null;
}

/**
 * A picked sheet for this focus wins. Otherwise the occurrence's own analysis
 * sheet / named layout wins even when another paper viewport also covers the
 * same model point. Geometry is only a fallback.
 */
export function chooseTakeoffSheetId(
  plan: { sheets: readonly DisplaySheet[]; initialId: string } | null,
  matchingPick: string | null,
  lastPick: string | null,
  mark: { nativeX: number; nativeY: number } | null,
  preferredId?: string | null,
): string {
  if (!plan) return 'model';
  const known = (id: string | null | undefined) => sheetIdInPlan(plan, id ?? null);
  const picked = known(matchingPick);
  if (picked) return picked;
  const preferred = known(preferredId) ?? (plan.initialId !== 'model' ? known(plan.initialId) : null);
  if (mark && Number.isFinite(mark.nativeX) && Number.isFinite(mark.nativeY)) {
    if (preferred) {
      const preferredSheet = plan.sheets.find((item) => item.id === preferred);
      if (preferredSheet?.kind === 'model') return preferred;
      if (preferredSheet) return preferred;
    }
    const owner = plan.sheets.find(
      (item) => item.kind === 'layout' && viewportForMark(item, mark.nativeX, mark.nativeY, []),
    );
    if (owner) return owner.id;
    return preferred ?? 'model';
  }
  if (preferred) return preferred;
  const stay = known(lastPick);
  if (stay) return stay;
  // A layout is opened only when a point lies in its viewport or the user picked it.
  // Opening the first layout with no point hid the model geometry on files whose
  // paper view does not project.
  return known(plan.initialId) ?? 'model';
}
