import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analysisViewSchema,
  workerJobRequestSchema,
  workerResultSchema,
  type WorkerJobRequest,
} from '@/modules/electrical-takeoff/domain/contracts';

const FIXTURES = join(process.cwd(), 'takeoff-worker/tests/fixtures/contract');

describe('TS<->Python contract fixtures', () => {
  it('parses worker result sample', () => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, 'worker-result.sample.json'), 'utf8'));
    const parsed = workerResultSchema.parse(raw);
    expect(parsed.jobId).toBe('job-sample-1');
    expect(parsed.detections).toHaveLength(1);
  });

  it('parses worker job request sample', () => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, 'worker-job-request.sample.json'), 'utf8'));
    const parsed = workerJobRequestSchema.parse(raw);
    expect(parsed.files[0]?.kind).toBe('pdf');
    expect(parsed.pairing).toEqual([{ pdfFileId: 'file-pdf-1', dwgFileId: 'file-dwg-1' }]);
  });

  it('worker job request pairing matches Python Pairing model shape', () => {
    const raw = JSON.parse(readFileSync(join(FIXTURES, 'worker-job-request.sample.json'), 'utf8'));
    const parsed = workerJobRequestSchema.parse(raw);
    const pair: WorkerJobRequest['pairing'][number] = { pdfFileId: 'a', dwgFileId: 'b' };
    const merged = workerJobRequestSchema.parse({ ...raw, pairing: [...parsed.pairing, pair] });
    expect(merged.pairing.every((p) => typeof p.pdfFileId === 'string' && typeof p.dwgFileId === 'string')).toBe(true);
  });

  it('defaults workerWarnings and workerStats on analysis view', () => {
    const parsed = analysisViewSchema.parse({
      summary: {
        id: 'a',
        name: 'n',
        status: 'draft',
        plannerKey: 'unknown',
        revision: 0,
        updatedAtIso: new Date().toISOString(),
        fileCount: 0,
        approvedAtIso: null,
        persistenceMode: 'persistent',
      },
      files: [],
      sheets: [],
      detections: [],
      areas: [],
      boq: {
        lines: [],
        unclassifiedCount: 0,
        needsReviewCount: 0,
        completeness: {
          sheetsTotal: 0,
          sheetsFullyAnalyzed: 0,
          partialSheets: [],
          skippedSheets: [],
          xrefsMissing: [],
          scaleUnverifiedSheets: [],
        },
        warnings: [],
        state: 'draft',
      },
      catalog: [],
      ruleSet: { id: 'default', name: 'x', scope: 'default', version: 1, rules: [] },
      lastJob: null,
      permissions: {
        canRun: true,
        canEdit: true,
        canApprove: false,
        canManageLibrary: false,
        canReopen: false,
        canPickFromProjectCloud: true,
        canPurgeEphemeral: false,
      },
    });
    expect(parsed.workerWarnings).toEqual([]);
    expect(parsed.workerStats).toEqual({});
  });
});