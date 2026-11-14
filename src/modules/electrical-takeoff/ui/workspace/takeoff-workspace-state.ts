import type { AnalysisView, CatalogType, EffectiveDetection } from '../../domain/contracts';

export type ViewerTool = 'navigate' | 'add' | 'area';

export interface TypeFilterState {
  hidden: Set<string>;
  soloTypeKey: string | null;
}

export interface TakeoffWorkspaceState {
  view: AnalysisView | null;
  loading: boolean;
  error: string | null;
  activeSheetKey: string | null;
  selectedDetectionId: string | null;
  highlightedDetectionIds: Set<string>;
  focusBoqLineKey: string | null;
  typeFilter: TypeFilterState;
  reviewIndex: number;
  viewerTool: ViewerTool;
  pendingEdits: boolean;
  saveNotice: string | null;
  jobPolling: boolean;
  mobilePanel: 'plan' | 'boq';
}

export const initialWorkspaceState = (): TakeoffWorkspaceState => ({
  view: null,
  loading: true,
  error: null,
  activeSheetKey: null,
  selectedDetectionId: null,
  highlightedDetectionIds: new Set(),
  focusBoqLineKey: null,
  typeFilter: { hidden: new Set(), soloTypeKey: null },
  reviewIndex: 0,
  viewerTool: 'navigate',
  pendingEdits: false,
  saveNotice: null,
  jobPolling: false,
  mobilePanel: 'plan',
});

export function colorForDetection(detection: EffectiveDetection, catalog: readonly CatalogType[]): string {
  if (!detection.typeKey) return '#94a3b8';
  return catalog.find((c) => c.key === detection.typeKey)?.colorHex ?? '#64748b';
}

export function detectionVisible(
  detection: EffectiveDetection,
  filter: TypeFilterState,
  highlighted: ReadonlySet<string>,
  focusDimOthers: boolean,
): boolean {
  const key = detection.typeKey ?? '__unclassified__';
  if (filter.soloTypeKey && key !== filter.soloTypeKey) return false;
  if (filter.hidden.has(key)) return false;
  if (focusDimOthers && highlighted.size > 0 && !highlighted.has(detection.id)) return false;
  return true;
}