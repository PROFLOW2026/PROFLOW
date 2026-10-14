import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROUTES = [
  'src/app/api/internal/sumit-expense-worker/route.ts',
  'src/app/api/internal/ocr-worker/route.ts',
  'src/app/api/internal/ops-worker/route.ts',
  'src/app/api/internal/dg-events-worker/route.ts',
] as const;

describe('internal worker maxDuration exports', () => {
  it.each(ROUTES)('%s exports maxDuration between 60 and 300', (relativePath) => {
    const source = readFileSync(path.join(process.cwd(), relativePath), 'utf8');
    const match = source.match(/export const maxDuration = (\d+)/);
    expect(match).not.toBeNull();
    const value = Number(match![1]);
    expect(value).toBeGreaterThanOrEqual(60);
    expect(value).toBeLessThanOrEqual(300);
  });
});
