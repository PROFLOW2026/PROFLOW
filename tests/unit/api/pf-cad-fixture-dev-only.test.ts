import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

describe('pf-cad-fixture route', () => {
  it('guards GET with devOnly production 404', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/app/api/dev/pf-cad-fixture/route.ts'),
      'utf8',
    );
    expect(source).toContain('function devOnly()');
    expect(source).toMatch(/NODE_ENV.*production/);
    expect(source).toMatch(/status: 404/);
    expect(source).toContain('const blocked = devOnly()');
  });

  it('returns 404 when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { GET } = await import('@/app/api/dev/pf-cad-fixture/route');
    const res = await GET(
      new Request('http://localhost/api/dev/pf-cad-fixture?bundle=3096-EL&name=3096-EL.dwg'),
    );
    expect(res.status).toBe(404);
    vi.unstubAllEnvs();
  });
});
