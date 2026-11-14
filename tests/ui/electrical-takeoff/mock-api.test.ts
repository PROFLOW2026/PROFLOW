import { describe, expect, it, beforeEach } from 'vitest';
import {
  createMockTakeoffApi,
  DEMO_ANALYSIS_ID,
  DEMO_PROJECT_ID,
  resetTakeoffMockStore,
} from '@/modules/electrical-takeoff/ui/mock-api';
import { TakeoffRevisionConflictError } from '@/modules/electrical-takeoff/ui/takeoff-errors';

describe('takeoff mock api', () => {
  beforeEach(() => resetTakeoffMockStore());

  it('lists demo analysis for demo project', async () => {
    const api = createMockTakeoffApi();
    const rows = await api.listAnalyses(DEMO_PROJECT_ID);
    expect(rows.some((r) => r.id === DEMO_ANALYSIS_ID)).toBe(true);
  });

  it('applyEdits bumps revision and reclassifies', async () => {
    const api = createMockTakeoffApi();
    const view = await api.getAnalysisView(DEMO_ANALYSIS_ID);
    const target = view.detections.find((d) => d.typeKey == null);
    expect(target).toBeTruthy();
    const next = await api.applyEdits(
      DEMO_ANALYSIS_ID,
      [{ op: 'reclassify', detectionId: target!.id, typeKey: 'light.recessed', saveToLibrary: false }],
      view.summary.revision,
    );
    expect(next.summary.revision).toBe(view.summary.revision + 1);
    expect(next.detections.find((d) => d.id === target!.id)?.typeKey).toBe('light.recessed');
  });

  it('throws revision conflict on stale token', async () => {
    const api = createMockTakeoffApi();
    await expect(
      api.applyEdits(DEMO_ANALYSIS_ID, [{ op: 'confirm', detectionIds: ['p1#1'] }], -1),
    ).rejects.toBeInstanceOf(TakeoffRevisionConflictError);
  });

  it('blocks approval while review items remain', async () => {
    const api = createMockTakeoffApi();
    const view = await api.getAnalysisView(DEMO_ANALYSIS_ID);
    await expect(api.approveAnalysis(DEMO_ANALYSIS_ID, view.summary.revision)).rejects.toThrow();
  });
});