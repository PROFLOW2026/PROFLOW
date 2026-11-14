import { describe, expect, it } from 'vitest';
import { TAKEOFF_CONTRACT_VERSION, type WorkerResult } from '@/modules/electrical-takeoff/domain/contracts';
import { collectWorkerWarningsFromResult } from '@/modules/electrical-takeoff/domain/worker-warnings';

describe('collectWorkerWarningsFromResult', () => {
  it('merges explicit warnings, errors, and sheet-derived xref/partial rows', () => {
    const result: WorkerResult = {
      contractVersion: TAKEOFF_CONTRACT_VERSION,
      jobId: 'j1',
      status: 'partial',
      startedAtIso: new Date().toISOString(),
      finishedAtIso: new Date().toISOString(),
      sheets: [
        {
          sheetKey: 'p1',
          fileId: 'f1',
          name: 'S1',
          kind: 'pdf_page',
          index: 0,
          widthPx: 10,
          heightPx: 10,
          previewArtifact: null,
          scale: { ratio: null, metersPerPreviewPx: null, verified: false, source: 'none' },
          analyzed: 'partial',
          xrefsMissing: [{ name: 'xref.dwg' }],
          hiddenByLayers: 0,
        },
      ],
      detections: [],
      legend: [],
      linear: [],
      warnings: [{ code: 'ai_unavailable', severity: 'warning', message: 'no ai' }],
      errors: [{ code: 'merge_failed', message: 'merge boom' }],
      stats: {},
      engineVersions: {},
    };
    const rows = collectWorkerWarningsFromResult(result);
    const codes = rows.map((r) => r.code);
    expect(codes).toContain('ai_unavailable');
    expect(codes).toContain('merge_failed');
    expect(codes).toContain('sheet_partial');
    expect(codes).toContain('xref_missing');
  });
});