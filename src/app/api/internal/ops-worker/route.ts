import { NextResponse } from 'next/server';
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
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

export const maxDuration = 300;

/**
 * Daily ops worker: expense recurrence, UWM task recurrence, task reminders,
 * storage provision recovery, material market refresh.
 * Vercel cron or an operator calls this with
 * `Authorization: Bearer $CRON_SECRET` (or OCR_WORKER_SECRET).
 *
 * Schedule: vercel.json → 06:00 UTC daily (`0 6 * * *`).
 * Storage recovery kicks the durable HTTP provision worker (lost-chain self-heal).
 * Task reminders scan each org sequentially inside the reminder worker.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [
    expenseRecurrence,
    taskRecurrence,
    taskReminders,
    notificationScan,
    storageProvision,
    materialMarket,
    sumitRecovery,
    quoteExpiry,
    materialPressureAlerts,
    marginSnapshots,
  ] = await Promise.all([
    generateDueRecurringDrafts(),
    runTaskRecurrenceOpsWorker(),
    runTaskReminderOpsWorker(),
    runNotificationScanOpsWorker().catch((error) => ({
      scanned: 0,
      emitted: 0,
      resolved: 0,
      failed: 1,
      failures: [{ organizationId: 'all', error: error instanceof Error ? error.message : String(error) }],
    })),
    recoverStorageProvisionViaWorker().catch((error) => ({
      kicked: false as const,
      detail: error instanceof Error ? error.message : String(error),
    })),
    runMaterialMarketRefresh().catch((error) => ({
      sourcesUpdated: 0,
      observationsUpserted: 0,
      snapshotsWritten: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    })),
    runSumitRecoveryOpsWorker().catch((error) => ({
      scanned: 0,
      resolved: 0,
      still_ambiguous: 0,
      failed: 1,
      failures: [{ organizationId: 'all', error: error instanceof Error ? error.message : String(error) }],
    })),
    runQuoteExpiryScan().catch((error) => ({
      expired: 0,
      notified: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    })),
    runMaterialPressureAlertScan().catch((error) => ({
      scanned: 0,
      emitted: 0,
      failed: 1,
      errors: [error instanceof Error ? error.message : String(error)],
    })),
    runMarginSnapshotOpsWorker().catch((error) => ({
      scanned: 0,
      snapshotsWritten: 0,
      failed: 1,
      errors: [error instanceof Error ? error.message : String(error)],
    })),
  ]);
  return NextResponse.json({
    expenseRecurrence,
    taskRecurrence,
    taskReminders,
    notificationScan,
    storageProvision,
    materialMarket,
    sumitRecovery,
    quoteExpiry,
    materialPressureAlerts,
    marginSnapshots,
  });
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
