import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/internal/storage-provision-worker/route';

describe('storage provision job status (OPS-002)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('GET returns read-only status without invoking POST accept path', async () => {
    vi.stubEnv('STORAGE_PROVISION_WORKER_SECRET', 'provision-secret');
    vi.stubEnv('VITEST', 'true');
    const response = await GET(
      new Request('http://localhost/api/internal/storage-provision-worker', {
        method: 'GET',
        headers: { authorization: 'Bearer provision-secret' },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { phase: string; recoveryWouldKick: boolean };
    expect(body.phase).toBe('idle');
    expect(body.recoveryWouldKick).toBe(false);
    expect(body).not.toHaveProperty('accepted');
  });
});
