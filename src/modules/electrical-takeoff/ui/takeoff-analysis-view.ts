import type { AnalysisView } from '../domain/contracts';

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

/** Library correction needs legend/block identity from the worker detection (server reads DB). */
export function canSaveReclassifyToLibrary(detection: AnalysisView['detections'][number], typeKey: string | null): boolean {
  if (!typeKey?.trim()) return false;
  if (detection.source === 'manual') return false;
  const hasIdentity = Boolean(detection.rawClass?.trim() || detection.tagText?.trim());
  const blocked = detection.reasons.includes('legend_unmapped') && !detection.tagText?.trim();
  return hasIdentity && !blocked;
}

export function detectionTwinLabel(detection: AnalysisView['detections'][number]): 'merged' | 'pdf_only' | 'dwg_only' | null {
  if (detection.source === 'merged') return 'merged';
  const reasons = detection.reasons as string[];
  if (reasons.includes('pdf_only')) return 'pdf_only';
  if (reasons.includes('dwg_only')) return 'dwg_only';
  if (reasons.includes('pdf_dwg_mismatch')) return detection.source === 'pdf' ? 'pdf_only' : 'dwg_only';
  return null;
}