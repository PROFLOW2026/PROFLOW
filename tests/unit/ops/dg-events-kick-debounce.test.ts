import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('dg-events kick debounce (OPS-001 / OPS-004)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('APP_URL', 'https://app.example');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('debounces remote kicks to once per 60s and logs kick failures', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);

    const kick = await import('@/modules/dg-events/application/kick');
    kick.resetDgEventKickStateForTests();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    kick.scheduleDgEventDrain();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    kick.scheduleDgEventDrain();
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(errorSpy.mock.calls.some((call) => String(call[0]).includes('tag=PF_USAGE_KICK_FAILURE'))).toBe(
      true,
    );

    errorSpy.mockRestore();
  });
});
