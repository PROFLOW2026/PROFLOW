import { NextResponse } from 'next/server';
import { generateDueRecurringDrafts } from '@/modules/recurring-drafts';
import { recoverStorageProvisionViaWorker } from '@/modules/external-storage/application/kick-storage-provision';
import { runTaskReminderOpsWorker } from '@/modules/notifications/application/task-reminder-ops-worker';
import { runMaterialMarketRefresh } from '@/modules/material-market';
import { runTaskRecurrenceOpsWorker } from '@/modules/tasks/application/task-recurrence-ops-worker';
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
  const [expenseRecurrence, taskRecurrence, taskReminders, storageProvision, materialMarket] =
    await Promise.all([
      generateDueRecurringDrafts(),
      runTaskRecurrenceOpsWorker(),
      runTaskReminderOpsWorker(),
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
    ]);
  return NextResponse.json({
    expenseRecurrence,
    taskRecurrence,
    taskReminders,
    storageProvision,
    materialMarket,
  });
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
