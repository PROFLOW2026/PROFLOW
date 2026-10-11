'use client';

import { submitAttendanceCorrectionRequestAction } from '@/app/[locale]/(app)/workforce/attendance/correction-actions';
import { AttendanceCorrectionRequestForm } from './attendance-correction-request-form';

export function AttendanceCorrectionSubmitSection({
  initialWorkDate,
  employeeId,
}: {
  readonly initialWorkDate?: string;
  readonly employeeId?: string;
}) {
  return (
    <AttendanceCorrectionRequestForm
      submitAction={async (prev, formData) => {
        if (employeeId) formData.set('employeeId', employeeId);
        return submitAttendanceCorrectionRequestAction(prev, formData);
      }}
      initialWorkDate={initialWorkDate}
    />
  );
}
