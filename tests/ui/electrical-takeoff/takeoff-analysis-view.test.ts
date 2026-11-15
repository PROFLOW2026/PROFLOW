import { describe, expect, it } from 'vitest';
import { buildDemoAnalysisView } from '@/modules/electrical-takeoff/ui/fixtures/demo-fixture';
import {
  aiAssistState,
  canSaveReclassifyToLibrary,
  detectionTwinLabel,
  hasBlockingWorkerWarnings,
  workerWarningsForView,
} from '@/modules/electrical-takeoff/ui/takeoff-analysis-view';

describe('takeoff-analysis-view helpers', () => {
  it('reads workerWarnings when present on view', () => {
    const view = buildDemoAnalysisView();
    const withWarnings = { ...view, workerWarnings: [{ code: 'xref_missing', severity: 'warning' as const, message: 'x.dwg' }] };
    expect(workerWarningsForView(withWarnings)).toHaveLength(1);
    expect(hasBlockingWorkerWarnings(withWarnings)).toBe(true);
    expect(aiAssistState(withWarnings)).toBe('off');
  });

  it('detects twin states from source and reasons', () => {
    const view = buildDemoAnalysisView();
    const d = view.detections[0]!;
    expect(detectionTwinLabel({ ...d, source: 'merged' })).toBe('merged');
    expect(detectionTwinLabel({ ...d, source: 'pdf', reasons: ['pdf_only' as never] })).toBe('pdf_only');
  });

  it('allows library save for an unclassified worker symbol once a catalog type is chosen', () => {
    const view = buildDemoAnalysisView();
    const d = view.detections[0]!;
    expect(canSaveReclassifyToLibrary({ ...d, signature: 'shape:socket', rawClass: '', tagText: null, source: 'pdf', reasons: ['unclassified'] }, 'control.switch.single')).toBe(true);
    expect(canSaveReclassifyToLibrary({ ...d, signature: 'shape:light', rawClass: '', tagText: null, reasons: ['legend_unmapped'] }, 'light.recessed')).toBe(true);
    expect(canSaveReclassifyToLibrary({ ...d, signature: null, rawClass: 'L7' }, 'light.recessed')).toBe(false);
    expect(canSaveReclassifyToLibrary({ ...d, source: 'manual', signature: 'shape:x', rawClass: 'L7' }, 'light.recessed')).toBe(false);
    expect(canSaveReclassifyToLibrary({ ...d, rawClass: 'L7' }, null)).toBe(false);
  });
});