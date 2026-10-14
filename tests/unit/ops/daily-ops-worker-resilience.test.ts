import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  generateDueRecurringDrafts: vi.fn(),
  runTaskRecurrenceOpsWorker: vi.fn(),
  runTaskReminderOpsWorker: vi.fn(),
  runNotificationScanOpsWorker: vi.fn(),
  recoverStorageProvisionViaWorker: vi.fn(),
  runMaterialMarketRefresh: vi.fn(),
  runSumitRecoveryOpsWorker: vi.fn(),
  runQuoteExpiryScan: vi.fn(),
  runMaterialPressureAlertScan: vi.fn(),
  runMarginSnapshotOpsWorker: vi.fn(),
  runDgEventsOpsWorker: vi.fn(),
  retryClaimCashProjectionOutbox: vi.fn(),
  runDocumentCleanupOpsWorker: vi.fn(),
}));

vi.mock('@/modules/recurring-drafts', () => ({
  generateDueRecurringDrafts: mocks.generateDueRecurringDrafts,
}));
vi.mock('@/modules/tasks/application/task-recurrence-ops-worker', () => ({
  runTaskRecurrenceOpsWorker: mocks.runTaskRecurrenceOpsWorker,
}));
vi.mock('@/modules/notifications/application/task-reminder-ops-worker', () => ({
  runTaskReminderOpsWorker: mocks.runTaskReminderOpsWorker,
}));
vi.mock('@/modules/notifications/application/notification-scan-ops-worker', () => ({
  runNotificationScanOpsWorker: mocks.runNotificationScanOpsWorker,
}));
vi.mock('@/modules/external-storage/application/kick-storage-provision', () => ({
  recoverStorageProvisionViaWorker: mocks.recoverStorageProvisionViaWorker,
}));
vi.mock('@/modules/material-market', () => ({
  runMaterialMarketRefresh: mocks.runMaterialMarketRefresh,
}));
vi.mock('@/modules/invoicing-integration/application/sumit-recovery-ops-worker', () => ({
  runSumitRecoveryOpsWorker: mocks.runSumitRecoveryOpsWorker,
}));
vi.mock('@/modules/quotes', () => ({
  runQuoteExpiryScan: mocks.runQuoteExpiryScan,
}));
vi.mock('@/modules/material-market/application/pressure-alert-ops-worker', () => ({
  runMaterialPressureAlertScan: mocks.runMaterialPressureAlertScan,
}));
vi.mock('@/modules/ops-finance/application/margin-snapshot-ops-worker', () => ({
  runMarginSnapshotOpsWorker: mocks.runMarginSnapshotOpsWorker,
}));
vi.mock('@/modules/dg-events/application/ops-worker', () => ({
  runDgEventsOpsWorker: mocks.runDgEventsOpsWorker,
}));
vi.mock('@/modules/connected-projects/application/retry-claim-cash-projection-outbox', () => ({
  retryClaimCashProjectionOutbox: mocks.retryClaimCashProjectionOutbox,
}));
vi.mock('@/modules/documents/application/document-cleanup-ops-worker', () => ({
  runDocumentCleanupOpsWorker: mocks.runDocumentCleanupOpsWorker,
}));

import { runDailyOpsWorker } from '@/modules/ops/application/daily-ops-worker';

function okPayload() {
  return {
    expenseRecurrence: {
      scanned: 1,
      generated: 0,
      skipped: 0,
      failed: 0,
      paymentsApplied: 0,
      failures: [],
    },
    taskRecurrence: {
      scanned: 1,
      generated: 0,
      skipped: 0,
      materialized: 0,
      failed: 0,
      failures: [],
    },
    taskReminders: { scanned: 1, emitted: 0, resolved: 0, failed: 0, failures: [] },
    notificationScan: { scanned: 1, emitted: 0, resolved: 0, failed: 0, failures: [] },
    storageProvision: { kicked: false, detail: 'ok' },
    materialMarket: { sourcesUpdated: 0, observationsUpserted: 0, snapshotsWritten: 0, errors: [] },
    sumitRecovery: { scanned: 0, resolved: 0, still_ambiguous: 0, failed: 0, failures: [] },
    quoteExpiry: { expired: 0, notified: 0, errors: [] },
    materialPressureAlerts: { scanned: 0, emitted: 0, failed: 0, errors: [] },
    marginSnapshots: { scanned: 0, snapshotsWritten: 0, failed: 0, errors: [] },
    dgEvents: {
      claimed: 0,
      processed: 0,
      ignored: 0,
      failed: 0,
      deadLettered: 0,
      internalNotifications: 0,
      externalNotifications: 0,
      resolved: 0,
      failures: [],
      deadLetterBacklog: 0,
    },
  };
}

describe('runDailyOpsWorker resilience', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns full payload when task recurrence throws', async () => {
    const ok = okPayload();
    mocks.generateDueRecurringDrafts.mockResolvedValue(ok.expenseRecurrence);
    mocks.runTaskRecurrenceOpsWorker.mockRejectedValue(new Error('boom'));
    mocks.runTaskReminderOpsWorker.mockResolvedValue(ok.taskReminders);
    mocks.runNotificationScanOpsWorker.mockResolvedValue(ok.notificationScan);
    mocks.recoverStorageProvisionViaWorker.mockResolvedValue(ok.storageProvision);
    mocks.runMaterialMarketRefresh.mockResolvedValue(ok.materialMarket);
    mocks.runSumitRecoveryOpsWorker.mockResolvedValue(ok.sumitRecovery);
    mocks.runQuoteExpiryScan.mockResolvedValue(ok.quoteExpiry);
    mocks.runMaterialPressureAlertScan.mockResolvedValue(ok.materialPressureAlerts);
    mocks.runMarginSnapshotOpsWorker.mockResolvedValue(ok.marginSnapshots);
    mocks.runDgEventsOpsWorker.mockResolvedValue(ok.dgEvents);
    mocks.retryClaimCashProjectionOutbox.mockResolvedValue({
      scanned: 2,
      applied: 1,
      failed: 0,
      skipped: 1,
    });
    mocks.runDocumentCleanupOpsWorker.mockResolvedValue({
      mode: 'report',
      orgsScanned: 3,
      candidates: 2,
      sample: [],
    });

    const payload = await runDailyOpsWorker(Date.now());

    expect(payload.taskRecurrence.failed).toBe(1);
    expect(payload.expenseRecurrence.scanned).toBe(1);
    expect(payload.crossOrgOutbox).toEqual({ scanned: 2, applied: 1, failed: 0, skipped: 1 });
    expect(payload.documentCleanup).toEqual({
      mode: 'report',
      orgsScanned: 3,
      candidates: 2,
      sample: [],
    });
    expect(mocks.runDocumentCleanupOpsWorker).toHaveBeenCalledOnce();
  });
});
