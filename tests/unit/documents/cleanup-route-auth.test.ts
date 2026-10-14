import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('document cleanup execute route auth', () => {
  it('requires ops-worker bearer auth and validates documentIds', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/app/api/internal/document-cleanup/route.ts'),
      'utf8',
    );
    expect(source).toContain("isInternalWorkerAuthorized(request, 'ops-worker')");
    expect(source).toContain('documentIds: z.array(z.string().uuid()).min(1).max(50)');
    expect(source).toMatch(/status: 401/);
    expect(source).toMatch(/status: 400/);
  });
});
