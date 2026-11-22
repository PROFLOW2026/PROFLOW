import { describe, expect, it } from 'vitest';
import { buildDemoAnalysisView } from '@/modules/electrical-takeoff/ui/fixtures/demo-fixture';
import {
  aiAssistState,
  buildSetLabelEdits,
  canSaveReclassifyToLibrary,
  detectionsSharingBoqItem,
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

  it('limits set_label to the same BOQ item, not a similar accessory', () => {
    const switchLine = {
      detectionIds: ['a', 'b'],
      originalLabel: 'מפסק מאור',
      label: 'מפסק מאור',
      typeKey: null,
      identitySource: 'legend' as const,
      ruleId: 'legend-count',
    };
    const crossLine = {
      detectionIds: ['c'],
      originalLabel: 'מפסק מאור צלב',
      label: 'מפסק מאור צלב',
      typeKey: null,
      identitySource: 'legend' as const,
      ruleId: 'legend-count',
    };
    const similarLine = {
      detectionIds: ['d'],
      originalLabel: 'מפסק מאור יחיד',
      label: 'מפסק מאור יחיד',
      typeKey: null,
      identitySource: 'legend' as const,
      ruleId: 'legend-count',
    };
    const otherFloor = {
      ...switchLine,
      detectionIds: ['e'],
    };
    expect(detectionsSharingBoqItem('a', [switchLine, crossLine, similarLine])).toEqual(['a', 'b']);
    expect(detectionsSharingBoqItem('a', [switchLine, otherFloor])).toEqual(['a', 'b', 'e']);
    expect(buildSetLabelEdits(['a', 'b'], '  מפסק מאור יחיד  ')).toEqual([
      { op: 'set_label', detectionId: 'a', label: 'מפסק מאור יחיד' },
      { op: 'set_label', detectionId: 'b', label: 'מפסק מאור יחיד' },
    ]);
    expect(buildSetLabelEdits(['a'], '   ')).toEqual([]);
  });
});