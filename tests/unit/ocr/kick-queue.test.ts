import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('kickDurableOcrQueue', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.VITEST;
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs the internal OCR worker on Vercel', async () => {
    process.env.VERCEL = '1';
    process.env.APP_URL = 'https://app.example.com';
    process.env.CRON_SECRET = 'test-cron-secret';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ claimed: 0, processed: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const afterMock = vi.fn((callback: () => void) => callback());
    vi.doMock('next/server', () => ({ after: afterMock }));

    const drainMock = vi.fn().mockResolvedValue({ claimed: 0, completed: 0 });
    vi.doMock('@/modules/ocr/application/drain-queue', () => ({
      drainDurableOcrQueue: drainMock,
    }));

    const { kickDurableOcrQueue } = await import('@/modules/ocr/application/kick-queue');
    kickDurableOcrQueue();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.example.com/api/internal/ocr-worker',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-cron-secret',
        }),
      }),
    );
  });

  it('falls back to NEXT_PUBLIC_APP_URL on Vercel', async () => {
    process.env.VERCEL = '1';
    delete process.env.APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://public.example.com';
    process.env.CRON_SECRET = 'test-cron-secret';

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ claimed: 1 }) });
    vi.stubGlobal('fetch', fetchMock);

    const afterMock = vi.fn((callback: () => void) => callback());
    vi.doMock('next/server', () => ({ after: afterMock }));
    vi.doMock('@/modules/ocr/application/drain-queue', () => ({
      drainDurableOcrQueue: vi.fn(),
    }));

    const { kickDurableOcrQueue } = await import('@/modules/ocr/application/kick-queue');
    kickDurableOcrQueue();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://public.example.com/api/internal/ocr-worker',
      expect.any(Object),
    );
  });

  it('no-ops under vitest', async () => {
    process.env.VITEST = 'true';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { kickDurableOcrQueue } = await import('@/modules/ocr/application/kick-queue');
    kickDurableOcrQueue();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
