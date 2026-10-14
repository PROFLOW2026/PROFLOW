import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const INTERNAL_API_DIR = path.resolve(process.cwd(), 'src/app/api/internal');

const ROUTE_SECRET: Record<string, string> = {
  'ops-worker': 'ops-worker',
  'sumit-expense-worker': 'sumit-expense-worker',
  'dg-events-worker': 'dg-events-worker',
  'ocr-worker': 'ocr-worker',
};

describe('internal worker routes (S06 / OD-53)', () => {
  it('each internal worker route passes an explicit route id to isInternalWorkerAuthorized', () => {
    for (const dir of Object.keys(ROUTE_SECRET)) {
      const file = path.join(INTERNAL_API_DIR, dir, 'route.ts');
      const source = readFileSync(file, 'utf8');
      expect(source, `${dir}/route.ts must call isInternalWorkerAuthorized`).toContain(
        'isInternalWorkerAuthorized',
      );
      expect(source).toContain(`'${ROUTE_SECRET[dir]}'`);
    }
  });
});
