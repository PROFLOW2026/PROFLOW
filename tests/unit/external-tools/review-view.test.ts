import { describe, expect, it } from 'vitest';
import { externalAnalysisView } from '@/modules/external-tools/application/review-view';
import type { WorkerDetection, WorkerSheet } from '@/modules/electrical-takeoff/domain/contracts';

const sheet: WorkerSheet = {
  sheetKey: 'model',
  fileId: 'host',
  name: 'plan',
  kind: 'dwg_model',
  index: 0,
  widthPx: 1000,
  heightPx: 800,
  previewArtifact: null,
  scale: { ratio: null, metersPerPreviewPx: null, verified: false, source: 'none' },
  analyzed: 'full',
  xrefsMissing: [],
  hiddenByLayers: 0,
};

const detection: WorkerDetection = {
  id: 'model#1',
  sheetKey: 'model',
  fileId: 'host',
  source: 'dwg',
  x: 120,
  y: 80,
  w: 16,
  h: 16,
  signature: 'block-a',
  signatureKind: 'dwg-block',
  rawClass: 'BLOCK-A',
  typeKey: null,
  classifiedBy: 'none',
  confidence: 'high',
  reasons: [],
};

describe('external review view', () => {
  it('builds the existing analysis view from a stored worker result', () => {
    const view = externalAnalysisView({
      sessionId: 'session-1',
      revision: 1,
      reviewedAt: null,
      updatedAt: new Date('2026-11-27T12:00:00Z'),
      files: [{ id: 'host', name: 'plan.dwg', kind: 'dwg', size: 10, sha256: 'abc' }],
      sheets: [sheet],
      detections: [detection],
      legend: [],
      warnings: [],
      edits: [],
      canEdit: true,
    });
    expect(view.summary.status).toBe('in_review');
    expect(view.permissions.canManageLibrary).toBe(false);
    expect(view.detections).toHaveLength(1);
    expect(view.detections[0]?.x).toBe(120);
    expect(view.boq.state).toBe('draft');
    expect(view.boq.lines.length).toBeGreaterThan(0);
  });

  it('marks the existing workbook approved only after temporary approval', () => {
    const view = externalAnalysisView({
      sessionId: 'session-1',
      revision: 2,
      reviewedAt: new Date('2026-11-27T13:00:00Z'),
      updatedAt: new Date('2026-11-27T13:00:00Z'),
      files: [{ id: 'host', name: 'plan.dwg', kind: 'dwg', size: 10, sha256: 'abc' }],
      sheets: [sheet],
      detections: [detection],
      legend: [],
      warnings: [],
      edits: [],
      canEdit: true,
    });
    expect(view.summary.status).toBe('approved');
    expect(view.boq.state).toBe('approved');
    expect(view.permissions.canApprove).toBe(false);
  });
});
