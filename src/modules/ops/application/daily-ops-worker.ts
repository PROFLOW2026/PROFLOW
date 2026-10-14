import 'server-only';

import { generateDueRecurringDrafts } from '@/modules/recurring-drafts';
import { recoverStorageProvisionViaWorker } from '@/modules/external-storage/application/kick-storage-provision';
import { runTaskReminderOpsWorker } from '@/modules/notifications/application/task-reminder-ops-worker';
import { runNotificationScanOpsWorker } from '@/modules/notifications/application/notification-scan-ops-worker';
import { runMaterialMarketRefresh } from '@/modules/material-market';
import { runTaskRecurrenceOpsWorker } from '@/modules/tasks/application/task-recurrence-ops-worker';
import { runSumitRecoveryOpsWorker } from '@/modules/invoicing-integration/application/sumit-recovery-ops-worker';
import { runQuoteExpiryScan } from '@/modules/quotes';
import { runMaterialPressureAlertScan } from '@/modules/material-market/application/pressure-alert-ops-worker';
import { runMarginSnapshotOpsWorker } from '@/modules/ops-finance/application/margin-snapshot-ops-worker';
import { runDgEventsOpsWorker } from '@/modules/dg-events/application/ops-worker';
import {
  retryClaimCashProjectionOutbox,
  type ClaimCashProjectionOutboxRecoveryResult,
} from '@/modules/connected-projects/application/retry-claim-cash-projection-outbox';
import { runDocumentCleanupOpsWorker } from '@/modules/documents/application/document-cleanup-ops-worker';
import { runWithMaxConcurrency } from '@/shared/async/run-with-concurrency';
import { logUsageKickFailure } from '@/shared/observability/runtime-usage-diag';

/** OPS-001: cap parallel sub-workers per cron tick (Vercel / DB egress safety). */
export const OPS_WORKER_MAX_CONCURRENT = 4;

/** Leave headroom under route `maxDuration` (300s) for JSON + logging. */
export const OPS_WORKER_SAFE_BUDGET_MS = 280_000;

const OUTBOX_RETRY_BUDGET_MS = 30_000;

export interface DailyOpsWorkerPayload {
  readonly expenseRecurrence: Awaited<ReturnType<typeof generateDueRecurringDrafts>>;
  readonly taskRecurrence: Awaited<ReturnType<typeof runTaskRecurrenceOpsWorker>>;
  readonly taskReminders: Awaited<ReturnType<typeof runTaskReminderOpsWorker>>;
  readonly notificationScan: Awaited<ReturnType<typeof runNotificationScanOpsWorker>>;
  readonly storageProvision: Awaited<ReturnType<typeof recoverStorageProvisionViaWorker>>;
  readonly materialMarket: Awaited<ReturnType<typeof runMaterialMarketRefresh>>;
  readonly sumitRecovery: Awaited<ReturnType<typeof runSumitRecoveryOpsWorker>>;
  readonly quoteExpiry: Awaited<ReturnType<typeof runQuoteExpiryScan>>;
  readonly materialPressureAlerts: Awaited<ReturnType<typeof runMaterialPressureAlertScan>>;
  readonly marginSnapshots: Awaited<ReturnType<typeof runMarginSnapshotOpsWorker>>;
  readonly dgEvents: Awaited<ReturnType<typeof runDgEventsOpsWorker>>;
  readonly crossOrgOutbox: ClaimCashProjectionOutboxRecoveryResult;
  readonly documentCleanup: Awaited<ReturnType<typeof runDocumentCleanupOpsWorker>>;
}

function remainingOpsBudgetMs(startedMs: number): number {
  return Math.max(5_000, OPS_WORKER_SAFE_BUDGET_MS - (Date.now() - startedMs));
}

function logSubWorkerFailure(name: string, error: unknown): void {
  logUsageKickFailure({
    fromModule: 'ops-worker/sub',
    toPath: name,
    reason: 'daily_ops_sub_worker',
    detail: error instanceof Error ? error.message : String(error),
  });
}

async function safeJob<T>(name: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    logSubWorkerFailure(name, error);
    return fallback;
  }
}

/**
 * Daily ops bundle. Sub-workers run with ≤4 concurrency; each module keeps its own
 * idempotency / bounded scans. Side effects are not duplicated by stagger alone.
 */
export async function runDailyOpsWorker(startedMs: number = Date.now()): Promise<DailyOpsWorkerPayload> {
  const dgMaxMs = Math.min(45_000, remainingOpsBudgetMs(startedMs));

  const jobs: readonly {
    readonly key: keyof Omit<DailyOpsWorkerPayload, 'crossOrgOutbox' | 'documentCleanup'>;
    readonly run: () => Promise<unknown>;
  }[] = [
    {
      key: 'expenseRecurrence',
      run: () =>
        safeJob('expenseRecurrence', {
          scanned: 0,
          generated: 0,
          skipped: 0,
          failed: 1,
          paymentsApplied: 0,
          failures: [{ draftId: 'ops-bundle', error: 'sub_worker_failed' }],
        }, () => generateDueRecurringDrafts()),
    },
    {
      key: 'taskRecurrence',
      run: () =>
        safeJob('taskRecurrence', {
          scanned: 0,
          generated: 0,
          skipped: 0,
          materialized: 0,
          failed: 1,
          failures: [{ organizationId: 'ops-bundle', error: 'sub_worker_failed' }],
        }, () => runTaskRecurrenceOpsWorker()),
    },
    {
      key: 'taskReminders',
      run: () =>
        safeJob('taskReminders', {
          scanned: 0,
          emitted: 0,
          resolved: 0,
          failed: 1,
          failures: [{ organizationId: 'ops-bundle', error: 'sub_worker_failed' }],
        }, () => runTaskReminderOpsWorker()),
    },
    {
      key: 'notificationScan',
      run: () =>
        safeJob('notificationScan', {
          scanned: 0,
          emitted: 0,
          resolved: 0,
          failed: 1,
          deferredOrgs: 0,
          failures: [
            {
              organizationId: 'all',
              error: 'sub_worker_failed',
            },
          ],
        }, () => runNotificationScanOpsWorker()),
    },
    {
      key: 'storageProvision',
      run: () =>
        safeJob('storageProvision', {
          kicked: false as const,
          detail: 'sub_worker_failed',
        }, () => recoverStorageProvisionViaWorker()),
    },
    {
      key: 'materialMarket',
      run: () =>
        safeJob('materialMarket', {
          sourcesUpdated: 0,
          observationsUpserted: 0,
          snapshotsWritten: 0,
          errors: ['sub_worker_failed'],
        }, () => runMaterialMarketRefresh()),
    },
    {
      key: 'sumitRecovery',
      run: () =>
        safeJob('sumitRecovery', {
          scanned: 0,
          resolved: 0,
          still_ambiguous: 0,
          archival_retried: 0,
          archival_succeeded: 0,
          failed: 1,
          failures: [
            {
              organizationId: 'all',
              error: 'sub_worker_failed',
            },
          ],
        }, () => runSumitRecoveryOpsWorker()),
    },
    {
      key: 'quoteExpiry',
      run: () =>
        safeJob('quoteExpiry', {
          orgsScanned: 0,
          notificationsEmitted: 0,
          quotesAutoExpired: 0,
          failed: 1,
          failures: [{ organizationId: 'ops-bundle', error: 'sub_worker_failed' }],
        }, () => runQuoteExpiryScan()),
    },
    {
      key: 'materialPressureAlerts',
      run: () =>
        safeJob('materialPressureAlerts', {
          scanned: 0,
          alertsDetected: 0,
          emitted: 0,
          failed: 1,
          failures: [{ organizationId: 'ops-bundle', error: 'sub_worker_failed' }],
        }, () => runMaterialPressureAlertScan()),
    },
    {
      key: 'marginSnapshots',
      run: () =>
        safeJob('marginSnapshots', {
          snapshotsWritten: 0,
          projectsScanned: 0,
          orgsScanned: 0,
          failed: 1,
          errors: ['sub_worker_failed'],
        }, () => runMarginSnapshotOpsWorker()),
    },
    {
      key: 'dgEvents',
      run: () =>
        safeJob('dgEvents', {
          claimed: 0,
          processed: 0,
          ignored: 0,
          failed: 1,
          deadLettered: 0,
          internalNotifications: 0,
          externalNotifications: 0,
          resolved: 0,
          failures: [
            {
              eventId: 'ops-bundle',
              eventType: 'runDgEventsOpsWorker',
              attempts: 0,
              error: 'sub_worker_failed',
            },
          ],
          deadLetterBacklog: 0,
        }, () => runDgEventsOpsWorker({ maxMs: dgMaxMs })),
    },
  ];

  const results = await runWithMaxConcurrency(
    jobs.map((job) => () => job.run()),
    OPS_WORKER_MAX_CONCURRENT,
  );

  const outboxBudgetMs = Math.min(OUTBOX_RETRY_BUDGET_MS, remainingOpsBudgetMs(startedMs));
  let crossOrgOutbox: ClaimCashProjectionOutboxRecoveryResult = {
    scanned: 0,
    applied: 0,
    failed: 0,
    skipped: 0,
  };
  if (outboxBudgetMs > 0) {
    try {
      crossOrgOutbox = await Promise.race([
        retryClaimCashProjectionOutbox(),
        new Promise<ClaimCashProjectionOutboxRecoveryResult>((_, reject) => {
          setTimeout(() => reject(new Error('cross_org_outbox_retry_timeout')), outboxBudgetMs);
        }),
      ]);
    } catch (error) {
      logSubWorkerFailure('connectedProjectsCashOutbox', error);
      crossOrgOutbox = {
        scanned: 0,
        applied: 0,
        failed: 1,
        skipped: 0,
      };
    }
  }

  const documentCleanup = await safeJob(
    'documentCleanup',
    { mode: 'report' as const, orgsScanned: 0, candidates: 0, sample: [] },
    () => runDocumentCleanupOpsWorker(),
  );

  return {
    expenseRecurrence: results[0] as DailyOpsWorkerPayload['expenseRecurrence'],
    taskRecurrence: results[1] as DailyOpsWorkerPayload['taskRecurrence'],
    taskReminders: results[2] as DailyOpsWorkerPayload['taskReminders'],
    notificationScan: results[3] as DailyOpsWorkerPayload['notificationScan'],
    storageProvision: results[4] as DailyOpsWorkerPayload['storageProvision'],
    materialMarket: results[5] as DailyOpsWorkerPayload['materialMarket'],
    sumitRecovery: results[6] as DailyOpsWorkerPayload['sumitRecovery'],
    quoteExpiry: results[7] as DailyOpsWorkerPayload['quoteExpiry'],
    materialPressureAlerts: results[8] as DailyOpsWorkerPayload['materialPressureAlerts'],
    marginSnapshots: results[9] as DailyOpsWorkerPayload['marginSnapshots'],
    dgEvents: results[10] as DailyOpsWorkerPayload['dgEvents'],
    crossOrgOutbox,
    documentCleanup,
  };
}
