'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '@/shared/auth/session';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import {
  submitAttendanceCorrectionRequest,
} from '@/modules/workforce/application/attendance-correction-requests';
import type { BusinessDate } from '@/shared/dates';

/**
 * Employee App server action: submit an attendance correction request for a
 * past date. Uses PIN-authenticated OrgContext.
 * ATTENDANCE_SELF permission is granted to all active employee app users by
 * baseline (enrich-context.ts), so no extra permission grant is required.
 */
export async function employeeSubmitAttendanceCorrectionAction(
  employeeId: string,
  workDate: string,
  requestedClockIn: string,
  requestedClockOut: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      await submitAttendanceCorrectionRequest(context, {
        employeeId,
        workDate: workDate as BusinessDate,
        requestedClockIn,
        requestedClockOut,
        reason,
      });
    });
    revalidatePath('/employee/attendance');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
