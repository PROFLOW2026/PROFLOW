import { afterEach, describe, expect, it, vi } from 'vitest';

const { runDailyOpsWorkerMock } = vi.hoisted(() => ({
  runDailyOpsWorkerMock: vi.fn(async () => ({
    expenseRecurrence: { scanned: 0, generated: 0, skipped: 0, failed: 0, failures: [] },
    taskRecurrence: { scanned: 0, created: 0, skipped: 0, failed: 0, failures: [] },
    taskReminders: { scanned: 0, sent: 0, failed: 0, failures: [] },
    notificationScan: { scanned: 0, emitted: 0, resolved: 0, failed: 0, failures: [] },
    storageProvision: { kicked: false, detail: 'test' },
    materialMarket: { sourcesUpdated: 0, observationsUpserted: 0, snapshotsWritten: 0, errors: [] },
    sumitRecovery: { scanned: 0, resolved: 0, still_ambiguous: 0, failed: 0, failures: [] },
    quoteExpiry: { expired: 0, notified: 0, errors: [] },
    materialPressureAlerts: { scanned: 0, emitted: 0, failed: 0, errors: [] },
    marginSnapshots: { scanned: 0, snapshotsWritten: 0, failed: 0, errors: [] },
    dgEvents: { claimed: 0, processed: 0, failed: 0, deadLetterBacklog: 0 },
  })),
}));

vi.mock('@/modules/ops/application/daily-ops-worker', () => ({
  runDailyOpsWorker: runDailyOpsWorkerMock,
  OPS_WORKER_MAX_CONCURRENT: 4,
}));

import { POST } from '@/app/api/internal/ops-worker/route';

describe('ops-worker route harness (OPS-005)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    runDailyOpsWorkerMock.mockClear();
  });

  it('returns 401 without bearer auth', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    const response = await POST(new Request('http://localhost/api/internal/ops-worker', { method: 'POST' }));
    expect(response.status).toBe(401);
    expect(runDailyOpsWorkerMock).not.toHaveBeenCalled();
  });

  it('runs the daily bundle once and returns all sub-worker keys', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    const response = await POST(
      new Request('http://localhost/api/internal/ops-worker', {
        method: 'POST',
        headers: { authorization: 'Bearer cron-secret' },
      }),
    );
    expect(response.status).toBe(200);
    expect(runDailyOpsWorkerMock).toHaveBeenCalledOnce();
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      [
        'dgEvents',
        'expenseRecurrence',
        'marginSnapshots',
        'materialMarket',
        'materialPressureAlerts',
        'notificationScan',
        'quoteExpiry',
        'storageProvision',
        'sumitRecovery',
        'taskRecurrence',
        'taskReminders',
      ].sort(),
    );
  });
});
