'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import {
  submitAttendanceCorrectionRequest,
} from '@/modules/workforce/application/attendance-correction-requests';
import { mapServerActionError } from '@/shared/errors';
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
    const tErrors = await getTranslations('errors');
    const tWorkforce = await getTranslations('workforce');
    return {
      ok: false,
      error: mapServerActionError(error, {
        tErrors: (key) => tErrors(key as 'unexpected'),
        namespaces: {
          workforce: (key) => tWorkforce(key as 'errors.emptyBulk'),
        },
        rethrowUnknown: false,
      }).error,
    };
  }
}
