import { describe, expect, it } from 'vitest';
import { persistableWorkerJobStats, redactFilesystemPath } from '@/modules/electrical-takeoff/domain/job-stats';
import type { WorkerResult } from '@/modules/electrical-takeoff/domain/contracts';

describe('persistableWorkerJobStats', () => {
  it('keeps numeric stats and stores workerBuild beside them', () => {
    const result = {
      stats: { legend_rows_read: 118, classified_count: 104 },
      engineVersions: { workerBuild: 'local-eval', ezdxf: '1.0' },
    } as unknown as WorkerResult;
    const stored = persistableWorkerJobStats(result);
    expect(stored.legend_rows_read).toBe(118);
    expect(stored.workerBuild).toBe('local-eval');
    expect(stored.engineVersions).toEqual({ workerBuild: 'local-eval', ezdxf: '1.0' });
  });

  it('records unknown when the worker omitted a build id', () => {
    const result = { stats: {}, engineVersions: {} } as unknown as WorkerResult;
    const stored = persistableWorkerJobStats(result);
    expect(stored.workerBuild).toBe('unknown');
  });

  it('does not persist a host path from engineVersions.libredwg', () => {
    const result = {
      stats: { legend_rows_read: 118 },
      engineVersions: {
        workerBuild: 'abc123',
        ezdxf: '1.4.5',
        libredwg: 'C:\\Users\\ERAN YOSEF\\Desktop\\final projects\\FINAL-WEB\\projectflow\\takeoff-worker\\tools\\bin\\dwg2dxf.exe',
      },
    } as unknown as WorkerResult;
    const stored = persistableWorkerJobStats(result);
    expect(stored.workerBuild).toBe('abc123');
    expect(stored.engineVersions).toEqual({
      workerBuild: 'abc123',
      ezdxf: '1.4.5',
      libredwg: 'dwg2dxf.exe',
    });
    expect(JSON.stringify(stored)).not.toMatch(/Users|Desktop|takeoff-worker/i);
  });
});

describe('redactFilesystemPath', () => {
  it('keeps version tokens and drops unix install paths', () => {
    expect(redactFilesystemPath('1.4.5')).toBe('1.4.5');
    expect(redactFilesystemPath('/usr/local/bin/dwg2dxf')).toBe('dwg2dxf');
  });
});
