import { describe, expect, it } from 'vitest';
import { scoreCompleteness } from '@/modules/month-close/domain/completeness';

describe('OD-36 owner_manager defined estimate completeness group', () => {
  it('does not reduce overall percent when owner pending-estimate is informational only', () => {
    const snapshot = scoreCompleteness(
      [
        { key: 'missing_employer_cost_actual', applicable: true, issueCount: 0 },
        {
          key: 'owner_manager_defined_estimate_pending_actual',
          applicable: true,
          issueCount: 1,
          sampleEntityIds: ['owner-id'],
        },
        { key: 'unallocated_employee_cost', applicable: true, issueCount: 0 },
        { key: 'vendor_bills_unallocated', applicable: true, issueCount: 0 },
        { key: 'open_time_corrections', applicable: true, issueCount: 0 },
        { key: 'ap_anomalies', applicable: true, issueCount: 0 },
        { key: 'missing_project_allocations', applicable: true, issueCount: 0 },
        { key: 'unresolved_expense_drafts', applicable: true, issueCount: 0 },
        { key: 'incomplete_attendance', applicable: false, issueCount: 0 },
        { key: 'open_overhead_allocation', applicable: true, issueCount: 0 },
        { key: 'unallocated_attendance_hours', applicable: false, issueCount: 0 },
        { key: 'pending_attendance_corrections', applicable: false, issueCount: 0 },
      ],
      { yearMonth: '2026-03' },
    );

    expect(snapshot.percent).toBe(100);
    const ownerItem = snapshot.items.find(
      (item) => item.key === 'owner_manager_defined_estimate_pending_actual',
    );
    expect(ownerItem).toMatchObject({
      applicable: true,
      issueCount: 1,
      scorePercent: 100,
      sampleEntityIds: ['owner-id'],
    });
  });
});
