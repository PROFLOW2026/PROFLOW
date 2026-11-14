import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportStatusUrl, waitForExportReady } from '@/modules/electrical-takeoff/ui/takeoff-export';

describe('takeoff-export', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('appends status=1 for polling', () => {
    expect(exportStatusUrl('/api/takeoff/export/a1?kind=xlsx')).toBe('/api/takeoff/export/a1?kind=xlsx&status=1');
    expect(exportStatusUrl('/api/contractor/takeoff/export/a1?kind=boq-pdf')).toContain('status=1');
  });

  it('resolves when HEAD returns 204 ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'HEAD') {
          return new Response(null, {
            status: 204,
            headers: { 'X-Takeoff-Export-Status': 'ready' },
          });
        }
        throw new Error('unexpected');
      }),
    );
    await expect(waitForExportReady('/api/takeoff/export/x?kind=xlsx')).resolves.toBeUndefined();
  });

  it('falls back to GET when HEAD is not allowed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'HEAD') return new Response(null, { status: 405 });
        return new Response(null, {
          status: 204,
          headers: { 'X-Takeoff-Export-Status': 'ready' },
        });
      }),
    );
    await expect(waitForExportReady('/api/takeoff/export/x?kind=xlsx')).resolves.toBeUndefined();
  });
});