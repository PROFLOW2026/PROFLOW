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

  it('gates library save on legend identity', () => {
    const view = buildDemoAnalysisView();
    const d = view.detections[0]!;
    expect(canSaveReclassifyToLibrary({ ...d, rawClass: 'L7', tagText: null }, 'light.recessed')).toBe(true);
    expect(canSaveReclassifyToLibrary({ ...d, rawClass: '', tagText: null, reasons: ['legend_unmapped'] }, 'light.recessed')).toBe(false);
  });
});