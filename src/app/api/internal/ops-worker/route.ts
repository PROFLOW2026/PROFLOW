import { NextResponse } from 'next/server';
import { generateDueRecurringDrafts } from '@/modules/recurring-drafts';
import { recoverStorageProvisionViaWorker } from '@/modules/external-storage/application/kick-storage-provision';
import { runTaskRecurrenceOpsWorker } from '@/modules/tasks/application/task-recurrence-ops-worker';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

/**
 * Daily ops worker: expense recurrence, UWM task recurrence, storage provision recovery.
 * Vercel cron or an operator calls this with
 * `Authorization: Bearer $CRON_SECRET` (or OCR_WORKER_SECRET).
 *
 * Schedule: vercel.json → 06:00 UTC daily (`0 6 * * *`).
 * Storage recovery kicks the durable HTTP provision worker (lost-chain self-heal).
 */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [expenseRecurrence, taskRecurrence, storageProvision] = await Promise.all([
    generateDueRecurringDrafts(),
    runTaskRecurrenceOpsWorker(),
    recoverStorageProvisionViaWorker().catch((error) => ({
      kicked: false as const,
      detail: error instanceof Error ? error.message : String(error),
    })),
  ]);
  return NextResponse.json({ expenseRecurrence, taskRecurrence, storageProvision });
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
