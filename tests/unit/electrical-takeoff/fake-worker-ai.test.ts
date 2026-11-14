import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import * as callbacks from '@/modules/electrical-takeoff/application/worker-callbacks';
import { ingestFakeWorkerResult } from '@/modules/electrical-takeoff/application/fake-worker-client';
import { TAKEOFF_CONTRACT_VERSION, type WorkerJobRequest, type WorkerResult } from '@/modules/electrical-takeoff/domain/contracts';

describe('fake worker useAi', () => {
  const prev = process.env.TAKEOFF_AI_BASE_URL;

  beforeEach(() => {
    delete process.env.TAKEOFF_AI_BASE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (prev === undefined) delete process.env.TAKEOFF_AI_BASE_URL;
    else process.env.TAKEOFF_AI_BASE_URL = prev;
  });

  it('includes ai_unavailable warning when useAi and TAKEOFF_AI_* unset', async () => {
    const captured: WorkerResult[] = [];
    vi.spyOn(callbacks, 'applyWorkerProgress').mockResolvedValue(undefined);
    vi.spyOn(callbacks, 'applyWorkerResult').mockImplementation(async (_db, _jobId, body) => {
      captured.push(body as WorkerResult);
      return { alreadyIngested: false };
    });

    const request: WorkerJobRequest = {
      contractVersion: TAKEOFF_CONTRACT_VERSION,
      jobId: randomUUID(),
      plannerKey: 'unknown',
      files: [{ fileId: 'f1', name: 'a.pdf', kind: 'pdf', sizeBytes: 1, downloadUrl: 'http://x', xrefs: [] }],
      catalog: [],
      symbolLibrary: [],
      pairing: [],
      sheetSelection: [],
      options: { previewMaxEdgePx: 6000, renderPreview: true, useAi: true, legendRegionHints: [] },
      callback: {
        progressUrl: 'http://127.0.0.1/progress',
        resultUrl: 'http://127.0.0.1/result',
        artifactUrl: 'http://127.0.0.1/artifact',
        token: 't',
      },
    };

    await ingestFakeWorkerResult({} as never, request);
    expect(captured[0]?.warnings.some((w) => w.code === 'ai_unavailable')).toBe(true);
  });
});