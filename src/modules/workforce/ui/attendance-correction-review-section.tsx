'use client';

import {
  approveAttendanceCorrectionAction,
  rejectAttendanceCorrectionAction,
} from '@/app/[locale]/(app)/workforce/attendance/correction-actions';
import type { AttendanceCorrectionRequestRecord } from '../data/attendance-corrections.repository';
import { AttendanceCorrectionRequestsPanel } from './attendance-correction-requests-panel';

export function AttendanceCorrectionReviewSection({
  requests,
  employeeNames,
  timeZone,
}: {
  readonly requests: readonly AttendanceCorrectionRequestRecord[];
  readonly employeeNames: ReadonlyMap<string, string>;
  readonly timeZone: string;
}) {
  return (
    <AttendanceCorrectionRequestsPanel
      requests={requests}
      employeeNames={employeeNames}
      timeZone={timeZone}
      onApprove={approveAttendanceCorrectionAction}
      onReject={rejectAttendanceCorrectionAction}
    />
  );
}
