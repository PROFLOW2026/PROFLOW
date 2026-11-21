import type { AnalysisView, TakeoffEdit } from '../domain/contracts';
import { sharedSymbolToken, type SymbolGroupDetection } from './symbol-group';

export function workerWarningsForView(view: AnalysisView): AnalysisView['workerWarnings'] {
  return view.workerWarnings ?? [];
}

export function hasBlockingWorkerWarnings(view: AnalysisView): boolean {
  return workerWarningsForView(view).some((w) => w.severity === 'warning' || w.severity === 'error');
}

export function aiAssistState(view: AnalysisView): 'on' | 'off' | 'unavailable' {
  const warnings = workerWarningsForView(view);
  if (warnings.some((w) => w.code === 'ai_unavailable')) return 'unavailable';
  if (warnings.some((w) => w.code === 'ai_active' || w.code === 'legend_ai')) return 'on';
  return 'off';
}

/**
 * A chosen catalog type can be stored on the planner library for any worker
 * detection. The server reads the symbol signature; a hand-added mark has none.
 * App surface (employee / contractor) is not a gate.
 */
export function canSaveReclassifyToLibrary(detection: AnalysisView['detections'][number], typeKey: string | null): boolean {
  if (!typeKey?.trim()) return false;
  if (detection.source === 'manual') return false;
  return Boolean(detection.signature?.trim());
}

/** One reclassify per id. Library save stays off for a hand mark or a detection with no signature. */
export function buildGroupReclassifyEdits(
  ids: readonly string[],
  detections: readonly AnalysisView['detections'][number][],
  typeKey: string | null,
  saveToLibrary: boolean,
): TakeoffEdit[] {
  const byId = new Map(detections.map((detection) => [detection.id, detection]));
  return ids.map((id) => {
    const detection = byId.get(id);
    return {
      op: 'reclassify',
      detectionId: id,
      typeKey,
      saveToLibrary: Boolean(saveToLibrary && detection && canSaveReclassifyToLibrary(detection, typeKey)),
    };
  });
}

export function legendDisplayText(row: {
  decodedText?: string | null;
  rawText?: string | null;
  key: string;
}): string {
  const decoded = row.decodedText?.trim();
  if (decoded) return decoded;
  const raw = row.rawText?.trim();
  if (raw) return raw;
  return row.key;
}

/** Two legend rows / two texts on the same mark. Catalog-family `type_ambiguous` is not this. */
export function hasRealLegendConflict(detection: {
  legendRowIds?: readonly string[];
  originalText?: string | null;
  legendUnambiguous?: boolean;
}): boolean {
  const rows = detection.legendRowIds ?? [];
  if (rows.length <= 1) return false;
  if (detection.legendUnambiguous === true) return false;
  return true;
}

export function confirmIdentityKey(
  detection: SymbolGroupDetection & {
    originalText?: string | null;
    legendRowIds?: readonly string[];
  },
): string {
  const text = (detection.originalText ?? '').trim();
  const rows = [...(detection.legendRowIds ?? [])].map((id) => id.trim()).filter(Boolean).sort().join(',');
  return `${sharedSymbolToken(detection)}|${text}|${rows}`;
}

export function sameConfirmIdentity(
  left: Parameters<typeof confirmIdentityKey>[0],
  right: Parameters<typeof confirmIdentityKey>[0],
): boolean {
  return confirmIdentityKey(left) === confirmIdentityKey(right);
}

export function legendConflictOnDetection(detection: {
  legendRowIds?: readonly string[];
  reasons: readonly string[];
  identitySource?: string;
  originalText?: string | null;
  legendUnambiguous?: boolean;
}): boolean {
  return hasRealLegendConflict(detection);
}

/** Legend-library save. Works when the symbol has no plan detection. */
export function buildLegendLibraryEdit(legendKey: string, typeKey: string): TakeoffEdit | null {
  const key = legendKey.trim();
  const type = typeKey.trim();
  if (!key || !type) return null;
  return { op: 'save_legend', legendKey: key, typeKey: type };
}

/** A chosen type must not keep telling the user the mark has no type. Other review reasons stay. */
export function visibleDetectionReasons<T extends string>(
  detection: { readonly typeKey: string | null; readonly reasons: readonly T[] },
): T[] {
  if (!detection.typeKey) return [...detection.reasons];
  return detection.reasons.filter((reason) => reason !== 'unclassified');
}

export function detectionTwinLabel(detection: AnalysisView['detections'][number]): 'merged' | 'pdf_only' | 'dwg_only' | null {
  if (detection.source === 'merged') return 'merged';
  const reasons = detection.reasons as string[];
  if (reasons.includes('pdf_only')) return 'pdf_only';
  if (reasons.includes('dwg_only')) return 'dwg_only';
  if (reasons.includes('pdf_dwg_mismatch')) return detection.source === 'pdf' ? 'pdf_only' : 'dwg_only';
  return null;
}