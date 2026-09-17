import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertMock = vi.fn().mockResolvedValue(undefined);
const getAdminDbMock = vi.fn(() => ({ insert: insertMock }));

vi.mock('@/shared/db/client', () => ({
  getAdminDb: () => getAdminDbMock(),
}));

vi.mock('@drizzle/schema', () => ({
  employeeAppAuditEvents: { _: 'employee_app_audit_events' },
}));

describe('insertEmployeeAppAuditEventTrusted', () => {
  beforeEach(() => {
    insertMock.mockClear();
    getAdminDbMock.mockClear();
    insertMock.mockImplementation(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    }));
  });

  it('writes audit events through the admin database connection', async () => {
    const { insertEmployeeAppAuditEventTrusted } = await import(
      '@/modules/employee-app/data/audit.repository'
    );

    await insertEmployeeAppAuditEventTrusted({
      organizationId: 'org-1',
      employeeId: 'emp-1',
      actorUserId: 'owner-1',
      action: 'permission_changed',
    });

    expect(getAdminDbMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
