import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { logUsageKickFailure } = vi.hoisted(() => ({
  logUsageKickFailure: vi.fn(),
}));

vi.mock('@/shared/observability/runtime-usage-diag', () => ({
  logUsageKickFailure,
  logUsageSelfHttp: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: (fn: () => void) => fn(),
}));

import { resetDgEventKickStateForTests, scheduleDgEventDrain } from '@/modules/dg-events/application/kick';

describe('dg-events kick HTTP failures', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetDgEventKickStateForTests();
    logUsageKickFailure.mockReset();
  });

  it('logs non-2xx worker responses', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('APP_URL', 'https://app.example.test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401 }) as Response),
    );

    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', '');
    scheduleDgEventDrain();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(logUsageKickFailure).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'HTTP 401' }),
    );
  });
});
