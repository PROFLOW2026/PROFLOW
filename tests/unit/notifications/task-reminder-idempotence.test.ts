import { describe, expect, it } from 'vitest';
import { dedupeReminderScanRows, taskDeepLinkForRecipient } from '@/modules/notifications/domain/task-links';
import { shouldEmitTaskReminder } from '@/modules/notifications/domain/task-reminder-gate';

const NOW = new Date('2026-09-25T06:00:00.000Z');

describe('task reminder emit gate', () => {
  it('emits when no row exists', () => {
    expect(shouldEmitTaskReminder([], NOW)).toBe(true);
  });

  it('does not reopen a surfaced or handled reminder', () => {
    expect(
      shouldEmitTaskReminder(
        [{ resolvedAt: null, dismissedAt: null, expiresAt: null }],
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldEmitTaskReminder(
        [{ resolvedAt: null, dismissedAt: NOW, expiresAt: null }],
        NOW,
      ),
    ).toBe(false);
  });

  it('skips until snooze expires, then emits again', () => {
    expect(
      shouldEmitTaskReminder(
        [{ resolvedAt: null, dismissedAt: NOW, expiresAt: new Date('2026-09-26T06:00:00.000Z') }],
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldEmitTaskReminder(
        [{ resolvedAt: null, dismissedAt: NOW, expiresAt: new Date('2026-09-24T06:00:00.000Z') }],
        NOW,
      ),
    ).toBe(true);
  });

  it('emits again after the previous row was resolved', () => {
    expect(
      shouldEmitTaskReminder(
        [{ resolvedAt: NOW, dismissedAt: null, expiresAt: null }],
        NOW,
      ),
    ).toBe(true);
  });
});

describe('employee task deep links', () => {
  it('keeps the owner task path for non-employee recipients', () => {
    expect(taskDeepLinkForRecipient('/tasks/abc', false)).toBe('/tasks/abc');
  });

  it('points employee recipients at the localized employee route', () => {
    expect(taskDeepLinkForRecipient('/tasks/abc', true)).toBe('/employee/tasks/abc');
    expect(taskDeepLinkForRecipient('/projects/p1?tab=schedule', true)).toBe(
      '/projects/p1?tab=schedule',
    );
  });

  it('collapses duplicate reminder rows for the same recipient', () => {
    const rows = dedupeReminderScanRows([
      { id: 'r1', recipientUserId: 'u1' },
      { id: 'r1', recipientUserId: 'u1' },
      { id: 'r1', recipientUserId: 'u2' },
    ]);
    expect(rows).toEqual([
      { id: 'r1', recipientUserId: 'u1' },
      { id: 'r1', recipientUserId: 'u2' },
    ]);
  });
});
