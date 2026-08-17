import { describe, expect, it } from 'vitest';
import {
  filterDailyLogsForToday,
  filterDispatchForEmployee,
  filterOpenPunchForEmployee,
} from '@/modules/field/domain/cockpit';

describe('field cockpit filters', () => {
  it('filters dispatch to the linked employee when present', () => {
    const rows = [
      {
        projectId: 'a',
        name: 'A',
        clientName: null,
        siteAddress: null,
        serviceStatus: 'scheduled' as const,
        priority: 'normal' as const,
        scheduledStartAt: null,
        scheduledEndAt: null,
        assigneeName: 'Me',
        assigneeEmployeeId: 'emp-1',
      },
      {
        projectId: 'b',
        name: 'B',
        clientName: null,
        siteAddress: null,
        serviceStatus: 'scheduled' as const,
        priority: 'normal' as const,
        scheduledStartAt: null,
        scheduledEndAt: null,
        assigneeName: 'Other',
        assigneeEmployeeId: 'emp-2',
      },
    ];
    expect(filterDispatchForEmployee(rows, 'emp-1')).toHaveLength(1);
    expect(filterDispatchForEmployee(rows, null)).toHaveLength(2);
  });

  it('keeps open punch items for the assignee', () => {
    const rows = [
      {
        id: '1',
        organizationId: 'o',
        projectId: 'p',
        workPackageId: null,
        title: 'Leak',
        description: null,
        status: 'open' as const,
        priority: 'normal' as const,
        location: null,
        dueDate: null,
        assigneeEmployeeId: 'emp-1',
        closedAt: null,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        organizationId: 'o',
        projectId: 'p',
        workPackageId: null,
        title: 'Done',
        description: null,
        status: 'done' as const,
        priority: 'normal' as const,
        location: null,
        dueDate: null,
        assigneeEmployeeId: 'emp-1',
        closedAt: null,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    expect(filterOpenPunchForEmployee(rows, 'emp-1')).toHaveLength(1);
  });

  it('filters daily logs to today', () => {
    const rows = [
      { logDate: '2026-08-17', id: '1' },
      { logDate: '2026-08-16', id: '2' },
    ] as never;
    expect(filterDailyLogsForToday(rows, '2026-08-17')).toHaveLength(1);
  });
});
