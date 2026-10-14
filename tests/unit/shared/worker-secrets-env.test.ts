import { afterEach, describe, expect, it, vi } from 'vitest';

describe('workerSecretsConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns true when any worker secret is set', async () => {
    vi.stubEnv('CRON_SECRET', 'cron');
    const { workerSecretsConfigured } = await import('@/shared/env/server');
    expect(workerSecretsConfigured()).toBe(true);
  });

  it('returns false when all worker secrets are unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('OCR_WORKER_SECRET', '');
    vi.stubEnv('STORAGE_PROVISION_WORKER_SECRET', '');
    const { workerSecretsConfigured } = await import('@/shared/env/server');
    expect(workerSecretsConfigured()).toBe(false);
  });
});
