import { describe, expect, it } from 'vitest';
import { buildDedupeKey } from '@/modules/notifications/domain/dedupe';
import { selectActorRecipients } from '@/modules/notifications/domain/recipients';

const SCANNER = 'scanner-worker';
const APPROVER = 'approver-1';
const TIME_APPROVER = 'time-approver-1';
const TIMESHEET_WORKER = 'timesheet-employee-1';
const ENTITY = '018f1234-5678-7abc-8def-0123456789ac';

describe('notification actor recipients', () => {
  it('does not notify the scanner user for approvals — only approvals.decide holders', () => {
    const recipients = selectActorRecipients({
      holders: [APPROVER],
      excludeUserIds: [SCANNER],
    });
    expect(recipients).toEqual([APPROVER]);
    expect(recipients).not.toContain(SCANNER);
  });

  it('does not notify the timesheet worker — only time.approve holders', () => {
    const recipients = selectActorRecipients({
      holders: [TIME_APPROVER, TIMESHEET_WORKER],
      excludeUserIds: [TIMESHEET_WORKER, SCANNER],
    });
    expect(recipients).toEqual([TIME_APPROVER]);
    expect(recipients).not.toContain(SCANNER);
    expect(recipients).not.toContain(TIMESHEET_WORKER);
  });

  it('prefers a named assignee over permission fan-out', () => {
    expect(
      selectActorRecipients({
        namedRecipientUserId: 'assignee-1',
        holders: [APPROVER, TIME_APPROVER],
      }),
    ).toEqual(['assignee-1']);
  });

  it('caps permission fan-out', () => {
    const holders = Array.from({ length: 20 }, (_, index) => `user-${index}`);
    expect(selectActorRecipients({ holders, cap: 8 })).toHaveLength(8);
  });

  it('includes the recipient in dedupe keys for approvals and timesheets', () => {
    expect(buildDedupeKey('approval_waiting', ENTITY, APPROVER)).toBe(
      `approval_waiting:${ENTITY}:${APPROVER}`,
    );
    expect(buildDedupeKey('timesheet_waiting', ENTITY, TIME_APPROVER)).not.toBe(
      buildDedupeKey('timesheet_waiting', ENTITY, SCANNER),
    );
  });
});
