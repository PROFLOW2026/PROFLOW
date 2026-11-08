import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { methodNotAllowedResponse } from '@/shared/http/method-not-allowed';
import { rejectUnauthorizedInternalWorker } from '@/shared/http/internal-worker-auth';

/** Routes whose GET previously ran the same job as POST. */
const CRON_GET_WORKERS = [
  {
    file: 'src/app/api/internal/ocr-worker/route.ts',
    route: 'ocr-worker',
    path: '/api/internal/ocr-worker',
    workerCall: 'drainDurableOcrQueue(',
  },
  {
    file: 'src/app/api/internal/ops-worker/route.ts',
    route: 'ops-worker',
    path: '/api/internal/ops-worker',
    workerCall: 'runDailyOpsWorker(',
  },
  {
    file: 'src/app/api/internal/sumit-expense-worker/route.ts',
    route: 'sumit-expense-worker',
    path: '/api/internal/sumit-expense-worker',
    workerCall: 'drainSumitExpenseIngestion(',
  },
] as const;

const POST_ONLY_WORKERS = [
  {
    file: 'src/app/api/internal/dg-events-worker/route.ts',
    workerCall: 'runDgEventsOpsWorker(',
  },
  {
    file: 'src/app/api/internal/ops-health/route.ts',
    workerCall: 'loadOpsHealthSnapshot(',
  },
] as const;

const NO_GET_ROUTES = [
  'src/app/api/internal/document-cleanup/route.ts',
  'src/app/api/internal/ops-replay/route.ts',
] as const;

function exportedFunction(source: string, name: string): string | null {
  const start = source.search(new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`));
  if (start < 0) return null;
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\nexport\s/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

describe('internal workers reject GET (S-06)', () => {
  it('methodNotAllowedResponse is 405 JSON', async () => {
    const response = methodNotAllowedResponse();
    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ error: 'method_not_allowed' });
  });

  it.each(POST_ONLY_WORKERS)('$file GET does not call the worker', ({ file, workerCall }) => {
    const source = readFileSync(path.join(process.cwd(), file), 'utf8');
    const get = exportedFunction(source, 'GET');
    const post = exportedFunction(source, 'POST');
    expect(get).not.toBeNull();
    expect(post).not.toBeNull();
    expect(get).toContain('return methodNotAllowedResponse()');
    expect(get).not.toContain(workerCall);
    expect(get).not.toContain('POST(');
    expect(post).toContain(workerCall);
  });



  it('scheduled workers accept GET only with the same bearer secret', () => {
    const vercel = JSON.parse(readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: { path: string }[];
    };
    expect(vercel.crons.map((cron) => cron.path)).toEqual(CRON_GET_WORKERS.map((worker) => worker.path));

    for (const worker of CRON_GET_WORKERS) {
      const source = readFileSync(path.join(process.cwd(), worker.file), 'utf8');
      const get = exportedFunction(source, 'GET');
      expect(get).toContain('rejectUnauthorizedInternalWorker');
      expect(get).toContain("'" + worker.route + "'");
      expect(get?.indexOf('rejectUnauthorizedInternalWorker')).toBeLessThan(get?.indexOf('return POST(request)') ?? -1);
      expect(get).not.toContain(worker.workerCall);
    }
  });

  it('a GET without the cron secret is unauthorized and does not run', async () => {
    const previous = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const denied = rejectUnauthorizedInternalWorker(
        new Request('https://example.test/api/internal/ocr-worker'),
        'ocr-worker',
      );
      expect(denied).not.toBeNull();
      expect(denied?.status).toBe(401);
      await expect(denied?.json()).resolves.toEqual({ error: 'unauthorized' });
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previous;
    }
  });

  it('the cron bearer is the same secret POST already requires', () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'cron-secret-value';
    try {
      const allowed = rejectUnauthorizedInternalWorker(
        new Request('https://example.test/api/internal/ops-worker', {
          headers: { authorization: 'Bearer cron-secret-value' },
        }),
        'ops-worker',
      );
      const wrong = rejectUnauthorizedInternalWorker(
        new Request('https://example.test/api/internal/ops-worker', {
          headers: { authorization: 'Bearer other-secret' },
        }),
        'ops-worker',
      );
      expect(allowed).toBeNull();
      expect(wrong?.status).toBe(401);
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previous;
    }
  });

  it.each(NO_GET_ROUTES)('%s does not export a GET handler', (file) => {
    const source = readFileSync(path.join(process.cwd(), file), 'utf8');
    expect(exportedFunction(source, 'GET')).toBeNull();
    expect(exportedFunction(source, 'POST')).not.toBeNull();
  });

  it('storage-provision GET reads status and does not run the provision cycle', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/app/api/internal/storage-provision-worker/route.ts'),
      'utf8',
    );
    const get = exportedFunction(source, 'GET');
    const post = exportedFunction(source, 'POST');
    expect(get).not.toBeNull();
    expect(get).not.toContain('runStorageProvisionCycle(');
    expect(get).not.toContain('methodNotAllowedResponse()');
    expect(get).toContain('loadStorageProvisionJobStatus(');
    expect(post).toContain('runStorageProvisionCycle(');
  });
});
