import { viewportForMark, type DisplaySheet } from './layout-display';

export type FocusLevel = 'symbol' | 'point' | 'region';

export function focusLevel(onSheet: boolean, located: boolean): FocusLevel {
  if (!onSheet) return 'region';
  if (located) return 'symbol';
  return 'point';
}

/**
 * A picked sheet for this focus wins. Otherwise a known point follows its layout.
 * With no point and no pick, a wide model opens the first layout so the view is not a strip.
 */
export function chooseTakeoffSheetId(
  plan: { sheets: readonly DisplaySheet[]; initialId: string } | null,
  matchingPick: string | null,
  lastPick: string | null,
  mark: { nativeX: number; nativeY: number } | null,
): string {
  if (!plan) return 'model';
  const known = (id: string | null) => (id && plan.sheets.some((item) => item.id === id) ? id : null);
  const picked = known(matchingPick);
  if (picked) return picked;
  if (mark && Number.isFinite(mark.nativeX) && Number.isFinite(mark.nativeY)) {
    const owner = plan.sheets.find(
      (item) => item.kind === 'layout' && viewportForMark(item, mark.nativeX, mark.nativeY, []),
    );
    if (owner) return owner.id;
    return 'model';
  }
  const stay = known(lastPick);
  if (stay) return stay;
  if (plan.initialId === 'model') {
    return plan.sheets.find((item) => item.kind === 'layout')?.id ?? 'model';
  }
  return known(plan.initialId) ?? 'model';
}
