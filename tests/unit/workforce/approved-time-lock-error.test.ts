import { describe, expect, it } from 'vitest';
import { isApprovedTimeLockError } from '@/modules/workforce/application/time-entry-cost-reconcile';

describe('isApprovedTimeLockError', () => {
  it('matches postgres raise text', () => {
    expect(
      isApprovedTimeLockError(
        new Error('time_entries: approved time is locked; use a correction'),
      ),
    ).toBe(true);
  });

  it('matches drizzle Failed query with nested cause', () => {
    const cause = Object.assign(
      new Error('time_entries: approved time is locked; use a correction'),
      { code: '23000' },
    );
    expect(
      isApprovedTimeLockError(new Error('Failed query: update "time_entries"', { cause })),
    ).toBe(true);
  });

  it('ignores unrelated failures', () => {
    expect(isApprovedTimeLockError(new Error('connection reset'))).toBe(false);
  });
});
