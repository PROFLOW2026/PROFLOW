import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { methodNotAllowedResponse } from '@/shared/http/method-not-allowed';

/** Routes whose GET previously ran the same job as POST. */
const POST_ONLY_WORKERS = [
  {
    file: 'src/app/api/internal/ocr-worker/route.ts',
    workerCall: 'drainDurableOcrQueue(',
  },
  {
    file: 'src/app/api/internal/ops-worker/route.ts',
    workerCall: 'runDailyOpsWorker(',
  },
  {
    file: 'src/app/api/internal/dg-events-worker/route.ts',
    workerCall: 'runDgEventsOpsWorker(',
  },
  {
    file: 'src/app/api/internal/sumit-expense-worker/route.ts',
    workerCall: 'drainSumitExpenseIngestion(',
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
