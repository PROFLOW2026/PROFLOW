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
import { retryClaimCashProjectionOutbox } from '@/modules/connected-projects/application/retry-claim-cash-projection-outbox';
import { runWithMaxConcurrency } from '@/shared/async/run-with-concurrency';
import { logUsageKickFailure } from '@/shared/observability/runtime-usage-diag';

/** OPS-001: cap parallel sub-workers per cron tick (Vercel / DB egress safety). */
export const OPS_WORKER_MAX_CONCURRENT = 4;

/** Leave headroom under route `maxDuration` (300s) for JSON + logging. */
export const OPS_WORKER_SAFE_BUDGET_MS = 280_000;

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

/**
 * Daily ops bundle. Sub-workers run with ≤4 concurrency; each module keeps its own
 * idempotency / bounded scans. Side effects are not duplicated by stagger alone.
 */
export async function runDailyOpsWorker(startedMs: number = Date.now()): Promise<DailyOpsWorkerPayload> {
  const dgMaxMs = Math.min(45_000, remainingOpsBudgetMs(startedMs));

  const jobs: readonly {
    readonly key: keyof DailyOpsWorkerPayload;
    readonly run: () => Promise<unknown>;
  }[] = [
    { key: 'expenseRecurrence', run: () => generateDueRecurringDrafts() },
    { key: 'taskRecurrence', run: () => runTaskRecurrenceOpsWorker() },
    { key: 'taskReminders', run: () => runTaskReminderOpsWorker() },
    {
      key: 'notificationScan',
      run: () =>
        runNotificationScanOpsWorker().catch((error) => {
          logSubWorkerFailure('notificationScan', error);
          return {
            scanned: 0,
            emitted: 0,
            resolved: 0,
            failed: 1,
            failures: [
              {
                organizationId: 'all',
                error: error instanceof Error ? error.message : String(error),
              },
            ],
          };
        }),
    },
    {
      key: 'storageProvision',
      run: () =>
        recoverStorageProvisionViaWorker().catch((error) => {
          logSubWorkerFailure('storageProvision', error);
          return {
            kicked: false as const,
            detail: error instanceof Error ? error.message : String(error),
          };
        }),
    },
    {
      key: 'materialMarket',
      run: () =>
        runMaterialMarketRefresh().catch((error) => {
          logSubWorkerFailure('materialMarket', error);
          return {
            sourcesUpdated: 0,
            observationsUpserted: 0,
            snapshotsWritten: 0,
            errors: [error instanceof Error ? error.message : String(error)],
          };
        }),
    },
    {
      key: 'sumitRecovery',
      run: () =>
        runSumitRecoveryOpsWorker().catch((error) => {
          logSubWorkerFailure('sumitRecovery', error);
          return {
            scanned: 0,
            resolved: 0,
            still_ambiguous: 0,
            failed: 1,
            failures: [
              {
                organizationId: 'all',
                error: error instanceof Error ? error.message : String(error),
              },
            ],
          };
        }),
    },
    {
      key: 'quoteExpiry',
      run: () =>
        runQuoteExpiryScan().catch((error) => {
          logSubWorkerFailure('quoteExpiry', error);
          return {
            expired: 0,
            notified: 0,
            errors: [error instanceof Error ? error.message : String(error)],
          };
        }),
    },
    {
      key: 'materialPressureAlerts',
      run: () =>
        runMaterialPressureAlertScan().catch((error) => {
          logSubWorkerFailure('materialPressureAlerts', error);
          return {
            scanned: 0,
            emitted: 0,
            failed: 1,
            errors: [error instanceof Error ? error.message : String(error)],
          };
        }),
    },
    {
      key: 'marginSnapshots',
      run: () =>
        runMarginSnapshotOpsWorker().catch((error) => {
          logSubWorkerFailure('marginSnapshots', error);
          return {
            scanned: 0,
            snapshotsWritten: 0,
            failed: 1,
            errors: [error instanceof Error ? error.message : String(error)],
          };
        }),
    },
    {
      key: 'dgEvents',
      run: () =>
        runDgEventsOpsWorker({ maxMs: dgMaxMs }).catch((error) => {
          logSubWorkerFailure('dgEvents', error);
          return {
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
                error: error instanceof Error ? error.message : String(error),
              },
            ],
            deadLetterBacklog: 0,
          };
        }),
    },
  ];

  const results = await runWithMaxConcurrency(
    jobs.map((job) => () => job.run()),
    OPS_WORKER_MAX_CONCURRENT,
  );

  retryClaimCashProjectionOutbox().catch((error) => {
    logSubWorkerFailure('connectedProjectsCashOutbox', error);
  });

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
  };
}
