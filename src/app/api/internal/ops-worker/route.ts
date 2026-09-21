import { NextResponse } from 'next/server';
import { generateDueRecurringDrafts } from '@/modules/recurring-drafts';
import { runStorageProvisionCycle } from '@/modules/external-storage/application/provision-batch';
import { runTaskRecurrenceOpsWorker } from '@/modules/tasks/application/task-recurrence-ops-worker';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

/**
 * Daily ops worker: expense recurrence, UWM task recurrence, automatic payment sync.
 * Vercel cron or an operator calls this with
 * `Authorization: Bearer $CRON_SECRET` (or OCR_WORKER_SECRET).
 *
 * Schedule: vercel.json → 06:00 UTC daily (`0 6 * * *`).
 */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [expenseRecurrence, taskRecurrence, storageProvision] = await Promise.all([
    generateDueRecurringDrafts(),
    runTaskRecurrenceOpsWorker(),
    runStorageProvisionCycle({ chain: 0 }).catch(() => null),
  ]);
  return NextResponse.json({ expenseRecurrence, taskRecurrence, storageProvision });
}

export async function GET(request: Request): Promise<Response> {
  return POST(request);
}
