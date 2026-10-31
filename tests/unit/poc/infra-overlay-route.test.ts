import { describe, expect, it } from 'vitest';
import { GET } from '../../../src/app/[locale]/poc/infra-overlay/route';

describe('infra overlay PoC page (temporary)', () => {
  it('serves a self-contained, non-indexed HTML page with no network or storage calls', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(response.headers.get('cache-control')).toBe('no-store');

    const html = await response.text();
    expect(html).toContain('getUserMedia');
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    // The photo must stay in the browser: no upload, no storage, no remote calls.
    expect(html).not.toMatch(/\bfetch\s*\(/);
    expect(html).not.toMatch(/XMLHttpRequest|sendBeacon|localStorage|indexedDB|FormData/);
  });
});
